// Own-bot scheduling shared by manual start and Google Calendar auto-join.
// Historical Recall recordings are still readable; new capture never falls back to Recall.
import { sb } from "./supa.js";
import { recordingGate } from "./plan.js";
import { listUpcomingEvents, annotateEvent } from "./google.js";
import { stopOrchestratorJob } from "./orch.js";
import { parseMeetingUrl, enabledPlatforms, meetingLimitMinutes } from "../../shared/meeting-platform.js";

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

export async function scheduleBot(userId, { meetingUrl, title, joinAt, calendarEventId, botName, manualRetry = false }) {
  let parsed;
  try { parsed = parseMeetingUrl(meetingUrl); }
  catch (error) { return { error: error.code === "unsupported_platform" ? error.code : "invalid_meeting_url", status: 400 }; }
  meetingUrl = parsed.url;
  if (!enabledPlatforms(process.env).has(parsed.platform)) return { error: "platform_disabled", status: 409, platform: parsed.platform };
  const OWN = process.env.BOT_ORCHESTRATOR_URL;
  if (!OWN) return { error: "bot_backend_unavailable", status: 503 };
  if (joinAt && !Number.isFinite(new Date(joinAt).getTime())) return { error: "invalid_join_at", status: 400 };

  if (calendarEventId) {
    // Dedup on the calendar event (one row per event, enforced by a DB unique index). Include ALL
    // statuses so a past errored meeting doesn't trigger a duplicate INSERT (23505) on every sweep.
    const ex = await sb(`meetings?user_id=eq.${userId}&calendar_event_id=eq.${encodeURIComponent(calendarEventId)}&select=id,bot_id,status,start_time,status_synced_at,meeting_url,error`);
    if (ex && ex.length) {
      const m0 = ex[0];
      const evStart = joinAt ? new Date(joinAt) : null;
      // RE-ARM the same row (can't insert a second one) when:
      //  - it errored and the event was rescheduled to the future, OR
      //  - it errored, the meeting is still ongoing (<60 min in), and the last attempt ended >12 min
      //    ago (join-wait is 10 min, so cycles never overlap and a ghost meeting can't spam boots),
      //    OR the user explicitly MOVED the event time (an edit beats the cooldown), OR
      //  - it's "scheduled" OR stuck "joining" but the event time moved (user rescheduled), OR
      //  - the Meet link changed (the bot would join a dead room), OR
      //  - the DISARM pass skipped it as cancelled but the event is back with a future time
      //    (user-skipped rows - no "cancelled" error text - stay off: that's their choice).
      const lastSync = m0.status_synced_at ? new Date(m0.status_synced_at).getTime() : 0;
      const futureEv = evStart && evStart.getTime() > Date.now() + 30000;
      const ongoingEv = evStart && evStart.getTime() > Date.now() - 60 * 60000;
      // A meeting whose start is well in the past and never got admitted is OVER - stop arming it
      // (join-wait is 10 min; 20 min past = the window closed). Prevents the perpetual re-arm loop
      // that kept a rescheduled-but-never-held meeting stuck "joining" forever.
      const windowOpen = evStart && evStart.getTime() > Date.now() - 20 * 60000;
      const cooledDown = Date.now() - lastSync > 12 * 60000;
      const timeChanged = evStart && m0.start_time && Math.abs(new Date(m0.start_time).getTime() - evStart.getTime()) > 120000;
      const urlChanged = meetingUrl && m0.meeting_url && meetingUrl !== m0.meeting_url;
      // Calendar polling must not repeatedly knock after a host denial or policy/auth barrier.
      // Only an authenticated manual retry or a changed event may retry these terminal outcomes.
      const retryBlocked = /AUTH_REQUIRED|MEETING_DENIED|CAPTCHA_REQUIRED|POLICY_BLOCKED|PASSCODE_REQUIRED|PASSCODE_INVALID/i.test(m0.error || "") && !manualRetry && !timeChanged && !urlChanged;
      const rearm = OWN && (
        (m0.status === "error" && !retryBlocked && (futureEv || (ongoingEv && (cooledDown || timeChanged || urlChanged || manualRetry)))) ||
        ((m0.status === "scheduled" || m0.status === "joining") && windowOpen && (timeChanged || urlChanged)) ||
        (m0.status === "skipped" && /cancelled or declined/i.test(m0.error || "") && futureEv)
      );
      // REUSED EVENT: the meeting already recorded (done) and the user re-scheduled the SAME
      // calendar event to a new present/future time -> keep the finished report intact, archive
      // the old row's event link (frees the unique index) and fall through to arm a FRESH row.
      if (!rearm && m0.status === "done" && timeChanged && (futureEv || ongoingEv)) {
        await sb(`meetings?id=eq.${m0.id}`, { method: "PATCH", body: { calendar_event_id: `${calendarEventId}#${Date.now()}` } });
      } else if (!rearm) {
        if (["error", "skipped"].includes(m0.status)) return { error: "meeting_not_armed", status: 409, meeting_id: m0.id };
        return { already: true, meeting: m0 };
      }
      if (rearm) {
        // PLAN GATE: Free tier gets a 60m meeting cap + a monthly recording budget; paid = 4h + unlimited.
        const gate = await recordingGate(userId);
        if (!gate.allow) return { error: "recording_limit", limit: true, plan: gate.plan, usedMin: gate.usedMin, capMin: gate.capMin };
        const schedOwn = futureEv;
        // start_time is ALWAYS the event's real start (never now()): overwriting it to now() made
        // timeChanged permanently true on the next sweep -> infinite re-arm loop for past events.
        const startIso = evStart ? evStart.toISOString() : new Date().toISOString();
        await sb(`meetings?id=eq.${m0.id}`, { method: "PATCH", body: { status: schedOwn ? "scheduled" : "joining", error: null, meeting_url: meetingUrl, start_time: startIso, status_synced_at: new Date().toISOString() } });
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
  // Cross-path dedup (V1 + V2 + cron): never two bots for the same active meeting URL.
  const exUrl = await sb(`meetings?user_id=eq.${userId}&meeting_url=eq.${encodeURIComponent(meetingUrl)}&status=in.(scheduled,joining,in_call,recording,processing)&select=id,bot_id`);
  if (exUrl && exUrl.length) return { already: true, meeting: exUrl[0] };

  const joinDate = joinAt ? new Date(joinAt) : null;

  // ===== Own bot only: validated platform, explicitly enabled rollout. =====
  if (OWN) {
    // PLAN GATE: Free tier gets a 60m meeting cap + a monthly recording budget; paid = 4h + unlimited.
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
        start_time: scheduledOwn ? joinDate.toISOString() : new Date().toISOString(), calendar_event_id: calendarEventId || null,
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
  let armed = 0, already = 0, skipped = 0;
  for (const e of events) {
    if (!e.meetingUrl || e.selfDeclined || e.status === "cancelled") { skipped++; continue; }
    const res = await scheduleBot(userId, { meetingUrl: e.meetingUrl, title: e.title, joinAt: e.start, calendarEventId: e.id, botName });
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
    const armedRows = await sb(`meetings?user_id=eq.${userId}&status=in.(scheduled,joining)&calendar_event_id=not.is.null&start_time=gt.${encodeURIComponent(winStart)}&start_time=lte.${encodeURIComponent(winEnd)}&select=id,calendar_event_id,meeting_url,start_time`);
    const liveEvents = new Map(events.map((e) => [e.id, e]));
    for (const row of armedRows) {
      // Recheck after the DB request/previous rows: a meeting may have started meanwhile.
      if (!row.meeting_url || !(new Date(row.start_time).getTime() > Date.now())) continue;
      const ev = liveEvents.get(row.calendar_event_id);
      if (ev && !ev.selfDeclined && ev.status !== "cancelled") continue;
      await sb(`meetings?id=eq.${row.id}`, { method: "PATCH", body: { status: "skipped", error: "event cancelled or declined", status_synced_at: new Date().toISOString() } });
      await stopOrchestratorJob(row.id);
      disarmed++;
    }
  }
  return { armed, already, skipped, disarmed, total: events.length };
}
