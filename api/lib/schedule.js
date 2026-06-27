// Schedules Recall bots for meetings. Shared by start-bot (manual), arm-all
// (on app load) and the cron (autonomous) so auto-join behaves like Read.ai.
import { sb } from "./supa.js";
import { recallBase } from "./recall.js";
import { listUpcomingEvents, annotateEvent } from "./google.js";
import { OCTO_AVATAR_JPEG_B64 } from "./avatar.js";

const RECALL_BASE = recallBase();

async function createRecallBot(recallBody) {
  // Try with the branded camera tile; if Recall rejects it, retry without so the
  // join never breaks because of the avatar.
  const withAvatar = { ...recallBody, automatic_video_output: { in_call_recording: { kind: "jpeg", b64_data: OCTO_AVATAR_JPEG_B64 } } };
  let r = await fetch(`${RECALL_BASE}/api/v1/bot/`, {
    method: "POST",
    headers: { Authorization: `Token ${process.env.RECALL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(withAvatar),
  });
  if (r.ok) return { r, bot: await r.json() };
  // Fallback without avatar.
  r = await fetch(`${RECALL_BASE}/api/v1/bot/`, {
    method: "POST",
    headers: { Authorization: `Token ${process.env.RECALL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(recallBody),
  });
  return { r, bot: await r.json() };
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

  const joinDate = joinAt ? new Date(joinAt) : null;
  const scheduled = joinDate && joinDate.getTime() > Date.now() + 30 * 1000;
  const recallBody = {
    meeting_url: meetingUrl,
    bot_name: botName || "OctoMeet AI Notetaker",
    recording_config: { transcript: { provider: { meeting_captions: {} } } },
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
