// Own-bot scheduling shared by manual start and Google Calendar auto-join.
// Historical Recall recordings are still readable; new capture never falls back to Recall.
import { sb } from "./supa.js";
import { recordingGate } from "./plan.js";
import { listUpcomingEvents, annotateEvent } from "./google.js";
import { stopOrchestratorJob } from "./orch.js";
import { parseMeetingUrl, enabledPlatforms, meetingLimitMinutes } from "../../shared/meeting-platform.js";
import { resolveZoomCaptureRoute, scheduleRtmsMeeting, expireRtmsIntents } from './zoom-routing.js';
import { disableRtmsMeeting } from './zoom-rtms.js';

// Compatibility entry point for old calendar connections: do not create paid-provider bots.
export async function syncRecallCalendar() {
  return { disabled: "legacy_calendar_disabled", events: 0, scheduled: 0 };
}

async function dispatchOwnBot(payload) {
  const signal = AbortSignal.timeout(10000);
  try {
    const response = await fetch(process.env.BOT_ORCHESTRATOR_URL.replace(/\/$/, "") + "/bots", {
      method: "POST", redirect: "error", signal,
      headers: { "Content-Type": "application/json", "x-orch-secret": process.env.ORCH_SHARED_SECRET || "" },
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await response.json(); } catch (error) { if (signal.aborted) throw error; }
    // Never echo upstream messages: they can contain meeting URLs/passcodes.
    if (!response.ok) {
      const status = [400, 409, 422, 429, 502, 503, 504].includes(response.status) ? response.status : 502;
      const safeCodes = ["invalid_meeting_url", "unsupported_platform", "platform_disabled"];
      return { error: safeCodes.includes(data?.error) ? data.error : "bot_dispatch_failed", status };
    }
    // Production returns 201 {id,state}; accept the 202 {jobId,state} variant too.
    const jobId = data?.id || data?.jobId;
    if (!data || data.ok === false || data.error || typeof jobId !== "string" || !jobId || !["queued", "booting", "running"].includes(data.state)) {
      return { error: "bot_dispatch_failed", status: 502 };
    }
    return { ok: true };
  } catch (error) {
    return signal.aborted || ["AbortError", "TimeoutError"].includes(error?.name)
      ? { error: "bot_dispatch_timeout", status: 504 }
      : { error: "bot_backend_unavailable", status: 503 };
  }
}

async function dispatchFailed(meetingId, failure) {
  try {
    // Do not overwrite an in-call/finished recording if a delayed response races a heartbeat.
    await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&status=in.(scheduled,joining)`, {
      method: "PATCH", body: { status: "error", error: failure.error, status_synced_at: new Date().toISOString() },
    });
  } catch {
    return { ...failure, meeting_id: meetingId, state_update_failed: true };
  }
  return { ...failure, meeting_id: meetingId };
}

export async function scheduleBot(userId, { meetingUrl, title, joinAt, endAt, calendarEventId, botName, manualRetry = false }) {
  let parsed;
  try { parsed = parseMeetingUrl(meetingUrl); }
  catch (error) { return { error: error.code === "unsupported_platform" ? error.code : "invalid_meeting_url", status: 400 }; }
  meetingUrl = parsed.url;
  if (!enabledPlatforms(process.env).has(parsed.platform)) return { error: "platform_disabled", status: 409, platform: parsed.platform };
  const captureRoute = await resolveZoomCaptureRoute(userId, parsed.platform);
  if (captureRoute.mode === 'rtms') return scheduleRtmsMeeting(userId, { meetingUrl, title, joinAt, endAt, calendarEventId, botName, manualRetry }, captureRoute);
  const OWN = process.env.BOT_ORCHESTRATOR_URL;
  if (!OWN) return { error: "bot_backend_unavailable", status: 503 };
  if (joinAt && !Number.isFinite(new Date(joinAt).getTime())) return { error: "invalid_join_at", status: 400 };
  const now = Date.now();
  const joinDate = joinAt ? new Date(joinAt) : null;
  const endDate = endAt ? new Date(endAt) : null;
  if (endDate && (!Number.isFinite(endDate.getTime()) || endDate.getTime() <= (joinDate?.getTime() ?? now))) return { error: "invalid_end_at", status: 400 };
  // The calendar window controls admission retries, never an admitted recording's duration.
  const windowOpen = (start, end) => {
    const startMs = start?.getTime();
    if (!Number.isFinite(startMs)) return false;
    const endMs = end ? new Date(end).getTime() : NaN;
    return now < (endMs > startMs ? endMs : startMs + 120 * 60000) + 5 * 60000;
  };

  if (calendarEventId) {
    // Dedup on the calendar event (one row per event, enforced by a DB unique index). Include ALL
    // statuses so a past errored meeting doesn't trigger a duplicate INSERT (23505) on every sweep.
    const ex = await sb(`meetings?user_id=eq.${userId}&calendar_event_id=eq.${encodeURIComponent(calendarEventId)}&select=id,bot_id,status,start_time,end_time,status_synced_at,meeting_url,error,recording_url`);
    if (ex && ex.length) {
      const m0 = ex[0];
      const evStart = joinDate;
      const lastSync = m0.status_synced_at ? new Date(m0.status_synced_at).getTime() : 0;
      const futureEv = evStart && evStart.getTime() > now + 30000;
      const cooledDown = now - lastSync > 12 * 60000;
      const timeChanged = evStart && m0.start_time && Math.abs(new Date(m0.start_time).getTime() - evStart.getTime()) > 120000;
      const urlChanged = meetingUrl && m0.meeting_url && meetingUrl !== m0.meeting_url;
      // A moved event must not inherit the previous occurrence's end time.
      const eventEnd = endDate?.toISOString() || (!timeChanged ? m0.end_time : null);
      const withinWindow = windowOpen(evStart, eventEnd);
      // Keep the existing completed-report reuse window narrow. Extending admission
      // retries must not detach historical reports from older calendar occurrences.
      const ongoingEv = withinWindow && evStart && evStart.getTime() > now - 60 * 60000;
      const guardedRow = `meetings?id=eq.${encodeURIComponent(m0.id)}&status=eq.${encodeURIComponent(m0.status)}` +
        (m0.status_synced_at ? `&status_synced_at=eq.${encodeURIComponent(m0.status_synced_at)}` : "&status_synced_at=is.null");
      // Calendar polling must not repeatedly knock after a host denial or policy/auth barrier.
      // Only an authenticated manual retry or a changed event may retry these terminal outcomes.
      const ended = /MEETING_ENDED/i.test(m0.error || "");
      const retryBlocked = !manualRetry && (ended
        ? !((timeChanged && futureEv) || urlChanged)
        : /AUTH_REQUIRED|MEETING_DENIED|CAPTCHA_REQUIRED|POLICY_BLOCKED|PASSCODE_REQUIRED|PASSCODE_INVALID/i.test(m0.error || "") && !timeChanged && !urlChanged);
      const rearm = OWN && (
        (m0.status === "error" && !retryBlocked && (manualRetry || (withinWindow && (futureEv || cooledDown || timeChanged || urlChanged)))) ||
        ((m0.status === "scheduled" || m0.status === "joining") && withinWindow && (timeChanged || urlChanged)) ||
        (m0.status === "skipped" && /cancelled or declined/i.test(m0.error || "") && futureEv)
      );
      // REUSED EVENT: the meeting already recorded (done) and the user re-scheduled the SAME
      // calendar event to a new present/future time -> keep the finished report intact, archive
      // the old row's event link (frees the unique index) and fall through to arm a FRESH row.
      if (!rearm && m0.status === "done" && timeChanged && (futureEv || ongoingEv)) {
        await sb(`meetings?id=eq.${m0.id}`, { method: "PATCH", body: { calendar_event_id: `${calendarEventId}#${Date.now()}` } });
      } else if (!rearm) {
        // Backfill/update the calendar end for pending rows without resetting their lifecycle.
        // The CAS also protects a recording/ingest that completed after the read above.
        if (endDate && ["scheduled", "joining", "error"].includes(m0.status) && !m0.recording_url && m0.end_time !== endDate.toISOString()) {
          await sb(guardedRow, { method: "PATCH", body: { end_time: endDate.toISOString() } });
        }
        if (["error", "skipped"].includes(m0.status)) return { error: "meeting_not_armed", status: 409, meeting_id: m0.id };
        return { already: true, meeting: m0 };
      }
      if (rearm) {
        // Plan limits still apply; every admitted recording is capped at two hours.
        const gate = await recordingGate(userId);
        if (!gate.allow) return { error: "recording_limit", limit: true, plan: gate.plan, usedMin: gate.usedMin, capMin: gate.capMin };
        const schedOwn = futureEv;
        // start_time is ALWAYS the event's real start (never now()): overwriting it to now() made
        // timeChanged permanently true on the next sweep -> infinite re-arm loop for past events.
        const startIso = evStart ? evStart.toISOString() : new Date().toISOString();
        const updated = await sb(guardedRow, { method: "PATCH", prefer: "return=representation", body: {
          status: schedOwn ? "scheduled" : "joining", error: null, meeting_url: meetingUrl,
          start_time: startIso, end_time: eventEnd || null, status_synced_at: new Date().toISOString(),
        } });
        if (!updated?.length) return { error: "meeting_not_armed", status: 409, meeting_id: m0.id };
        const APP0 = (process.env.APP_URL || "https://meet-ai-three-beige.vercel.app").replace(/\/+$/, "");
        const dispatched = await dispatchOwnBot({
          meetingId: m0.id, botId: m0.bot_id, userId, meetingUrl, platform: parsed.platform,
          joinAt: schedOwn ? joinAt : null, botName: botName || "OctoMeet AI", maxMeetingMin: meetingLimitMinutes(gate.maxMeetingMin),
          callbackUrl: APP0 + "/api/bot/ingest", statusUrl: APP0 + "/api/bot/status", callbackSecret: process.env.BOT_INGEST_SECRET,
        });
        if (!dispatched.ok) return dispatchFailed(m0.id, dispatched);
        return { ok: true, rearmed: true, scheduled: !!schedOwn, bot_id: m0.bot_id, meeting: m0, mode: "inhouse" };
      }
      // (done-reuse falls through: a fresh row is inserted and armed below)
    }
  }
  if (!manualRetry && joinDate && !windowOpen(joinDate, endDate)) return { error: "meeting_not_armed", status: 409 };
  // Cross-path dedup (V1 + V2 + cron): never two bots for the same active meeting URL.
  const exUrl = await sb(`meetings?user_id=eq.${userId}&meeting_url=eq.${encodeURIComponent(meetingUrl)}&status=in.(scheduled,joining,in_call,recording,processing)&select=id,bot_id`);
  if (exUrl && exUrl.length) return { already: true, meeting: exUrl[0] };

  // ===== Own bot only: validated platform, explicitly enabled rollout. =====
  if (OWN) {
    // Plan limits still apply; every admitted recording is capped at two hours.
    // Fails open (recordingGate returns allow:true on any lookup error) so a paid user is never blocked.
    const gate = await recordingGate(userId);
    if (!gate.allow) return { error: "recording_limit", limit: true, plan: gate.plan, usedMin: gate.usedMin, capMin: gate.capMin };
    const scheduledOwn = joinDate && joinDate.getTime() > Date.now() + 30 * 1000;
    const botId = "own_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const m = await sb("meetings", {
      method: "POST", prefer: "return=representation",
      body: {
        user_id: userId, title: title || "Live meeting", source: "OctoMeet Bot", meeting_url: meetingUrl,
        bot_id: botId, status: scheduledOwn ? "scheduled" : "joining", capture_mode: "inhouse_bot",
        stage_info: { platform: parsed.platform },
        start_time: joinDate ? joinDate.toISOString() : new Date().toISOString(), end_time: endDate?.toISOString() || null,
        calendar_event_id: calendarEventId || null,
      },
    });
    const APP = (process.env.APP_URL || "https://meet-ai-three-beige.vercel.app").replace(/\/+$/, "");
    const dispatched = await dispatchOwnBot({
      meetingId: m[0].id, botId, userId, meetingUrl, platform: parsed.platform,
      joinAt: scheduledOwn ? joinAt : null, botName: botName || "OctoMeet AI", maxMeetingMin: meetingLimitMinutes(gate.maxMeetingMin),
      callbackUrl: APP + "/api/bot/ingest", statusUrl: APP + "/api/bot/status", callbackSecret: process.env.BOT_INGEST_SECRET,
    });
    if (!dispatched.ok) return dispatchFailed(m[0].id, dispatched);
    if (calendarEventId) annotateEvent(userId, calendarEventId, "🐙 OctoMeet AI will join and record this meeting, then add the AI summary & report link here.").catch(() => {});
    return { ok: true, scheduled: !!scheduledOwn, bot_id: botId, meeting: m[0], mode: "inhouse" };
  }

}

// Schedule hosted AND invited events, including tentative/unanswered invitations.
// Organizer identity and calendar write permission are not prerequisites to attend.
export async function armUserCalendar(userId, { botName, days = 7 } = {}) {
  const { events, error, truncated, fetchedAt } = await listUpcomingEvents(userId, { days });
  if (error) return { error, armed: 0 };
  if (process.env.ZOOM_RTMS_ROUTING === 'true') await expireRtmsIntents(userId);
  let armed = 0, already = 0, skipped = 0;
  for (const e of events) {
    if (!e.meetingUrl || e.selfDeclined || e.status === "cancelled") { skipped++; continue; }
    const res = await scheduleBot(userId, { meetingUrl: e.meetingUrl, title: e.title, joinAt: e.start, endAt: e.end, calendarEventId: e.id, botName });
    if (res.ok) armed++;
    // "already" armed: scheduleBot annotated the event when it was first armed - don't PATCH the
    // calendar event again on every sweep (the orchestrator hits this every few minutes now).
    else if (res.already) already++;
    else skipped++;
  }

  // DISARM pass: armed rows whose calendar event vanished (cancelled/deleted) or was declined
  // must not send a bot into a dead room. Skipped entirely when the fetch was TRUNCATED (cap
  // hit with pages pending) - an incomplete list must never mass-skip meetings.
  // Google's timeMin filters on event END: absence is safe to act on only for events that
  // have not started. Include the final minute, but never infer cancellation after start.
  // Keep the far edge inside the feed's timeMax, which filters on event START.
  let disarmed = 0;
  if (!truncated) {
    const base = fetchedAt || Date.now();
    const winStart = new Date(Math.max(base, Date.now())).toISOString(); // strictly future, even after a slow fetch
    const winEnd = new Date(base + days * 86400000 - 10 * 60000).toISOString(); // 10 min inside timeMax
    const armedRows = await sb(`meetings?user_id=eq.${userId}&status=in.(scheduled,joining)&calendar_event_id=not.is.null&start_time=gt.${encodeURIComponent(winStart)}&start_time=lte.${encodeURIComponent(winEnd)}&select=id,calendar_event_id,meeting_url,start_time,capture_mode,status`);
    const liveEvents = new Map(events.map((e) => [e.id, e]));
    for (const row of armedRows) {
      // Recheck after the DB request/previous rows: a meeting may have started meanwhile.
      if (!row.meeting_url || !(new Date(row.start_time).getTime() > Date.now())) continue;
      const ev = liveEvents.get(row.calendar_event_id);
      if (ev && !ev.selfDeclined && ev.status !== "cancelled") continue;
      if (row.capture_mode === 'zoom_rtms') await disableRtmsMeeting(userId, row.id);
      else {
        const changed = await sb(`meetings?id=eq.${row.id}&status=in.(scheduled,joining)`, { method: "PATCH", prefer: 'return=representation', body: { status: "skipped", error: "event cancelled or declined", status_synced_at: new Date().toISOString() } });
        if (!changed?.length) continue;
        await stopOrchestratorJob(row.id);
      }
      disarmed++;
    }
  }
  return { armed, already, skipped, disarmed, total: events.length };
}
