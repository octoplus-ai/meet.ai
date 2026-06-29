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
  if (!process.env.RECALL_API_KEY) return { error: "RECALL_API_KEY missing" };

  if (calendarEventId) {
    const ex = await sb(`meetings?user_id=eq.${userId}&calendar_event_id=eq.${encodeURIComponent(calendarEventId)}&status=neq.error&select=id,bot_id`);
    if (ex && ex.length) return { already: true, meeting: ex[0] };
  }
  // Cross-path dedup (V1 + V2 + cron): never two bots for the same active meeting URL.
  const exUrl = await sb(`meetings?user_id=eq.${userId}&meeting_url=eq.${encodeURIComponent(meetingUrl)}&status=in.(scheduled,joining,in_call,recording,processing)&select=id,bot_id`);
  if (exUrl && exUrl.length) return { already: true, meeting: exUrl[0] };

  const joinDate = joinAt ? new Date(joinAt) : null;
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
  const note = "🐙 OctoMeet AI will join and record this meeting, then add the AI summary & report link here.";
  for (const e of events) {
    if (!e.meetingUrl || e.selfDeclined) { skipped++; continue; }
    const res = await scheduleBot(userId, { meetingUrl: e.meetingUrl, title: e.title, joinAt: e.start, calendarEventId: e.id, botName });
    if (res.ok) armed++;
    else if (res.already) { already++; annotateEvent(userId, e.id, note).catch(() => {}); }
    else skipped++;
  }
  return { armed, already, skipped, total: events.length };
}
