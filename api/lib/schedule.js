// Schedules Recall bots for meetings. Shared by start-bot (manual), arm-all
// (on app load) and the cron (autonomous) so auto-join behaves like Read.ai.
import { sb } from "./supa.js";
import { recallBase, transcriptProvider, CAPTIONS_PROVIDER } from "./recall.js";
import { listUpcomingEvents, annotateEvent } from "./google.js";
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
    const ex = await sb(`meetings?user_id=eq.${userId}&calendar_event_id=eq.${encodeURIComponent(calendarEventId)}&select=id,bot_id,status,start_time,status_synced_at`);
    if (ex && ex.length) {
      const m0 = ex[0];
      const evStart = joinAt ? new Date(joinAt) : null;
      // RE-ARM the same row (can't insert a second one) when:
      //  - it errored and the event was rescheduled to the future, OR
      //  - it errored, the meeting is still ongoing (<60 min in), and the last attempt ended >12 min
      //    ago (join-wait is 10 min, so cycles never overlap and a ghost meeting can't spam boots), OR
      //  - it's still "scheduled" but the event time moved (user rescheduled before it ran).
      const lastSync = m0.status_synced_at ? new Date(m0.status_synced_at).getTime() : 0;
      const futureEv = evStart && evStart.getTime() > Date.now() + 30000;
      const ongoingEv = evStart && evStart.getTime() > Date.now() - 60 * 60000;
      const cooledDown = Date.now() - lastSync > 12 * 60000;
      const timeChanged = evStart && m0.start_time && Math.abs(new Date(m0.start_time).getTime() - evStart.getTime()) > 120000;
      const rearm = OWN && ((m0.status === "error" && (futureEv || (ongoingEv && cooledDown))) || (m0.status === "scheduled" && timeChanged));
      if (!rearm) return { already: true, meeting: m0 };
      const schedOwn = futureEv;
      await sb(`meetings?id=eq.${m0.id}`, { method: "PATCH", body: { status: schedOwn ? "scheduled" : "joining", error: null, meeting_url: meetingUrl, start_time: schedOwn ? evStart.toISOString() : new Date().toISOString(), status_synced_at: new Date().toISOString() } });
      const APP0 = (process.env.APP_URL || "https://meet-ai-three-beige.vercel.app").replace(/\/+$/, "");
      try {
        await fetch(OWN.replace(/\/$/, "") + "/bots", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-orch-secret": process.env.ORCH_SHARED_SECRET || "" },
          body: JSON.stringify({ meetingId: m0.id, botId: m0.bot_id, userId, meetingUrl, joinAt: schedOwn ? joinAt : null, botName: botName || "OctoMeet AI", callbackUrl: APP0 + "/api/bot/ingest", statusUrl: APP0 + "/api/bot/status", callbackSecret: process.env.BOT_INGEST_SECRET }),
        });
      } catch (e) { /* next sweep retries */ }
      return { ok: true, rearmed: true, scheduled: !!schedOwn, bot_id: m0.bot_id, meeting: m0, mode: "inhouse" };
    }
  }
  // Cross-path dedup (V1 + V2 + cron): never two bots for the same active meeting URL.
  const exUrl = await sb(`meetings?user_id=eq.${userId}&meeting_url=eq.${encodeURIComponent(meetingUrl)}&status=in.(scheduled,joining,in_call,recording,processing)&select=id,bot_id`);
  if (exUrl && exUrl.length) return { already: true, meeting: exUrl[0] };

  const joinDate = joinAt ? new Date(joinAt) : null;

  // ===== In-house bot path (own orchestrator). Falls through to Recall if not configured. =====
  if (OWN) {
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
        body: JSON.stringify({ meetingId: m[0].id, botId, userId, meetingUrl, joinAt: joinAt || null, botName: botName || "OctoMeet AI", callbackUrl: APP + "/api/bot/ingest", statusUrl: APP + "/api/bot/status", callbackSecret: process.env.BOT_INGEST_SECRET }),
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
  const { events, error } = await listUpcomingEvents(userId, { days });
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
  return { armed, already, skipped, total: events.length };
}
