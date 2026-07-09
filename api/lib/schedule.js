// Schedules Recall bots for meetings. Shared by start-bot (manual), arm-all
// (on app load) and the cron (autonomous) so auto-join behaves like Read.ai.
import { sb } from "./supa.js";
import { recordingGate } from "./plan.js";
import { recallBase, transcriptProvider, CAPTIONS_PROVIDER } from "./recall.js";
import { listUpcomingEvents, annotateEvent } from "./google.js";
import { stopOrchestratorJob } from "./orch.js";
import { OCTO_AVATAR_JPEG_B64 } from "./avatar.js";
import { listCalendarEvents, scheduleBotForEvent, botIdFromEvent } from "./recall-calendar.js";

const RECALL_BASE = recallBase();

function googleEventId(ev) {
  return ev.platform_id || (ev.raw && (ev.raw.id || ev.raw.iCalUID)) || ev.ical_uid || ev.id;
}

// Sync a connected Recall calendar: schedule a notetaker bot for every upcoming
// meeting that doesn't already have one. Used on connect (initial pass) and by the
// calendar webhook (ongoing). Dedups on meeting_url; skips meetings that already ended.
export async function syncRecallCalendar(userId, calendarId, { botName, sinceTs } = {}) {
  const events = await listCalendarEvents(calendarId, sinceTs);
  const now = Date.now();
  let scheduled = 0;
  for (const e of events) {
    if (e.is_deleted || !e.meeting_url) continue;
    if (e.end_time && new Date(e.end_time).getTime() < now - 5 * 60000) continue; // already ended
    const gid = googleEventId(e);
    // Early dedup: one row per calendar event (also enforced atomically by a DB unique index).
    if (gid) { const exEvt = await sb(`meetings?user_id=eq.${userId}&calendar_event_id=eq.${encodeURIComponent(gid)}&select=id`); if (exEvt.length) continue; }
    const dup = await sb(`meetings?user_id=eq.${userId}&meeting_url=eq.${encodeURIComponent(e.meeting_url)}&status=in.(scheduled,joining,in_call,recording,processing)&select=id`);
    if (dup.length) continue;
    const r = await scheduleBotForEvent(e.id, { dedupKey: `${e.start_time || ""}-${e.meeting_url}`, botName: botName || "OctoMeet AI" });
    const botId = botIdFromEvent(r.data) || botIdFromEvent(e);
    if (!botId) continue;
    const exBot = await sb(`meetings?bot_id=eq.${encodeURIComponent(botId)}&select=id`);
    if (exBot.length) continue; // a row for this bot already exists
    try {
      await sb("meetings", {
        method: "POST",
        body: {
          user_id: userId, title: e.title || (e.raw && e.raw.summary) || "Meeting", source: "Recall", meeting_url: e.meeting_url,
          bot_id: botId, status: "scheduled", start_time: e.start_time || null, calendar_event_id: gid,
        },
      });
    } catch (err) { if (/23505|duplicate/i.test(String(err.message || ""))) continue; throw err; } // race lost → another path already inserted it
    if (gid) annotateEvent(userId, gid, "🐙 OctoMeet AI will join and record this meeting, then add the AI summary & report link here.").catch(() => {});
    scheduled++;
  }
  return { events: events.length, scheduled };
}

async function postBot(body) {
  const r = await fetch(`${RECALL_BASE}/api/v1/bot/`, {
    method: "POST",
    headers: { Authorization: `Token ${process.env.RECALL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { r, bot: await r.json() };
}

async function createRecallBot(recallBody) {
  // 1) Branded camera tile. 2) If rejected, drop the avatar. 3) Last resort, fall back
  // to meeting_captions so a transcript-provider config issue can NEVER break scheduling.
  const withAvatar = { ...recallBody, automatic_video_output: { in_call_recording: { kind: "jpeg", b64_data: OCTO_AVATAR_JPEG_B64 } } };
  let res = await postBot(withAvatar);
  if (res.r.ok) return res;
  res = await postBot(recallBody);
  if (res.r.ok) return res;
  const safe = { ...recallBody, recording_config: { transcript: { provider: CAPTIONS_PROVIDER } } };
  return await postBot(safe);
}

// Create a Recall bot (optionally scheduled via join_at) + a meetings row.
// Dedups on calendar_event_id so we never double-book a calendar meeting.
export async function scheduleBot(userId, { meetingUrl, title, joinAt, calendarEventId, botName }) {
  if (!meetingUrl) return { skipped: "no url" };
  const OWN = process.env.BOT_ORCHESTRATOR_URL; // set once the in-house bot is live -> use it instead of Recall
  if (!OWN && !process.env.RECALL_API_KEY) return { error: "RECALL_API_KEY missing" };

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
      const rearm = OWN && (
        (m0.status === "error" && (futureEv || (ongoingEv && (cooledDown || timeChanged)))) ||
        ((m0.status === "scheduled" || m0.status === "joining") && windowOpen && (timeChanged || urlChanged)) ||
        (m0.status === "skipped" && /cancelled or declined/i.test(m0.error || "") && futureEv)
      );
      // REUSED EVENT: the meeting already recorded (done) and the user re-scheduled the SAME
      // calendar event to a new present/future time -> keep the finished report intact, archive
      // the old row's event link (frees the unique index) and fall through to arm a FRESH row.
      if (!rearm && m0.status === "done" && timeChanged && (futureEv || ongoingEv)) {
        await sb(`meetings?id=eq.${m0.id}`, { method: "PATCH", body: { calendar_event_id: `${calendarEventId}#${Date.now()}` } });
      } else if (!rearm) return { already: true, meeting: m0 };
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
        try {
          await fetch(OWN.replace(/\/$/, "") + "/bots", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-orch-secret": process.env.ORCH_SHARED_SECRET || "" },
            body: JSON.stringify({ meetingId: m0.id, botId: m0.bot_id, userId, meetingUrl, joinAt: schedOwn ? joinAt : null, botName: botName || "OctoMeet AI", maxMeetingMin: gate.maxMeetingMin, callbackUrl: APP0 + "/api/bot/ingest", statusUrl: APP0 + "/api/bot/status", callbackSecret: process.env.BOT_INGEST_SECRET }),
          });
        } catch (e) { /* next sweep retries */ }
        return { ok: true, rearmed: true, scheduled: !!schedOwn, bot_id: m0.bot_id, meeting: m0, mode: "inhouse" };
      }
      // (done-reuse falls through: a fresh row is inserted and armed below)
    }
  }
  // Cross-path dedup (V1 + V2 + cron): never two bots for the same active meeting URL.
  const exUrl = await sb(`meetings?user_id=eq.${userId}&meeting_url=eq.${encodeURIComponent(meetingUrl)}&status=in.(scheduled,joining,in_call,recording,processing)&select=id,bot_id`);
  if (exUrl && exUrl.length) return { already: true, meeting: exUrl[0] };

  const joinDate = joinAt ? new Date(joinAt) : null;

  // ===== In-house bot path (own orchestrator). Falls through to Recall if not configured. =====
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
        start_time: scheduledOwn ? joinDate.toISOString() : new Date().toISOString(), calendar_event_id: calendarEventId || null,
      },
    });
    const APP = (process.env.APP_URL || "https://meet-ai-three-beige.vercel.app").replace(/\/+$/, "");
    try {
      await fetch(OWN.replace(/\/$/, "") + "/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-orch-secret": process.env.ORCH_SHARED_SECRET || "" },
        body: JSON.stringify({ meetingId: m[0].id, botId, userId, meetingUrl, joinAt: scheduledOwn ? joinAt : null, botName: botName || "OctoMeet AI", maxMeetingMin: gate.maxMeetingMin, callbackUrl: APP + "/api/bot/ingest", statusUrl: APP + "/api/bot/status", callbackSecret: process.env.BOT_INGEST_SECRET }),
      });
    } catch (e) { /* orchestrator unreachable: the meeting stays 'scheduled' and can be retried */ }
    if (calendarEventId) annotateEvent(userId, calendarEventId, "🐙 OctoMeet AI will join and record this meeting, then add the AI summary & report link here.").catch(() => {});
    return { ok: true, scheduled: !!scheduledOwn, bot_id: botId, meeting: m[0], mode: "inhouse" };
  }

  const scheduled = joinDate && joinDate.getTime() > Date.now() + 30 * 1000;
  const recallBody = {
    meeting_url: meetingUrl,
    bot_name: botName || "OctoMeet AI",
    recording_config: { transcript: { provider: transcriptProvider() } },
  };
  if (scheduled) recallBody.join_at = joinDate.toISOString();

  const { r, bot } = await createRecallBot(recallBody);
  if (!r.ok) return { error: "recall error", detail: bot };

  const m = await sb("meetings", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: userId, title: title || "Live meeting", source: "Recall", meeting_url: meetingUrl,
      bot_id: bot.id, status: scheduled ? "scheduled" : "joining",
      start_time: scheduled ? joinDate.toISOString() : new Date().toISOString(),
      calendar_event_id: calendarEventId || null,
    },
  });
  // Surface inside the user's real Google Calendar event (best-effort).
  if (calendarEventId) annotateEvent(userId, calendarEventId, "🐙 OctoMeet AI will join and record this meeting, then add the AI summary & report link here.").catch(() => {});
  return { ok: true, scheduled: !!scheduled, bot_id: bot.id, meeting: m[0] };
}

// Schedule bots for ALL of a user's upcoming calendar events with a meeting link.
export async function armUserCalendar(userId, { botName, days = 7 } = {}) {
  const { events, error, truncated, fetchedAt } = await listUpcomingEvents(userId, { days });
  if (error) return { error, armed: 0 };
  let armed = 0, already = 0, skipped = 0;
  for (const e of events) {
    if (!e.meetingUrl || e.selfDeclined) { skipped++; continue; }
    const res = await scheduleBot(userId, { meetingUrl: e.meetingUrl, title: e.title, joinAt: e.start, calendarEventId: e.id, botName });
    if (res.ok) armed++;
    // "already" armed: scheduleBot annotated the event when it was first armed - don't PATCH the
    // calendar event again on every sweep (the orchestrator hits this every few minutes now).
    else if (res.already) already++;
    else skipped++;
  }

  // DISARM pass: armed rows whose calendar event vanished (cancelled/deleted) or was declined
  // must not send a bot into a dead room. Skipped entirely when the fetch was TRUNCATED (cap
  // hit with pages pending) - an incomplete list must never mass-skip meetings. The window is
  // anchored to the FEED's own clock (fetchedAt) and shrunk on both ends: Google's timeMin
  // filters on event END (imminent/started meetings can drop off the feed while still valid)
  // and timeMax on event START, so only comfortably-inside-the-window FUTURE rows are judged.
  let disarmed = 0;
  if (!truncated) {
    const base = fetchedAt || Date.now();
    const winStart = new Date(base + 60000).toISOString();               // future events only
    const winEnd = new Date(base + days * 86400000 - 10 * 60000).toISOString(); // 10 min inside timeMax
    const armedRows = await sb(`meetings?user_id=eq.${userId}&status=in.(scheduled,joining)&calendar_event_id=not.is.null&start_time=gte.${encodeURIComponent(winStart)}&start_time=lte.${encodeURIComponent(winEnd)}&select=id,calendar_event_id,meeting_url`);
    const liveEvents = new Map(events.map((e) => [e.id, e]));
    for (const row of armedRows) {
      if (!row.meeting_url) continue;
      const ev = liveEvents.get(row.calendar_event_id);
      if (ev && !ev.selfDeclined) continue;
      await sb(`meetings?id=eq.${row.id}`, { method: "PATCH", body: { status: "skipped", error: "event cancelled or declined", status_synced_at: new Date().toISOString() } });
      await stopOrchestratorJob(row.id);
      disarmed++;
    }
  }
  return { armed, already, skipped, disarmed, total: events.length };
}
