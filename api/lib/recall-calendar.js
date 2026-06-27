// Recall.ai Calendar V2: connect a Google Calendar (via our own OAuth refresh token)
// so Recall auto-syncs events and we schedule notetaker bots in real time —
// works even when our app is closed (Read.ai-style).
import { recallBase } from "./recall.js";
import { OCTO_AVATAR_JPEG_B64 } from "./avatar.js";

const BASE = recallBase();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "540014435995-d8rb5g8a9c4rv82vo4dtak9eoh3e2ufi.apps.googleusercontent.com";

function authHeaders() {
  return { Authorization: `Token ${process.env.RECALL_API_KEY}`, "Content-Type": "application/json" };
}

// Connect (or return error) a Google Calendar to Recall using a stored refresh token.
export async function createRecallCalendar(refreshToken, oauthEmail) {
  const r = await fetch(`${BASE}/api/v2/calendars/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      platform: "google_calendar",
      oauth_client_id: GOOGLE_CLIENT_ID,
      oauth_client_secret: process.env.GOOGLE_CLIENT_SECRET,
      oauth_refresh_token: refreshToken,
      oauth_email: oauthEmail || undefined,
    }),
  });
  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
}

export async function getRecallCalendar(calendarId) {
  const r = await fetch(`${BASE}/api/v2/calendars/${calendarId}/`, { headers: authHeaders() });
  if (!r.ok) return null;
  return r.json();
}

// List events for a calendar, optionally only those updated since a timestamp.
export async function listCalendarEvents(calendarId, sinceTs) {
  const qs = new URLSearchParams({ calendar_id: calendarId });
  if (sinceTs) qs.set("updated_at__gte", sinceTs);
  const out = [];
  let url = `${BASE}/api/v2/calendar-events/?${qs.toString()}`;
  for (let i = 0; i < 5 && url; i++) {
    const r = await fetch(url, { headers: authHeaders() });
    if (!r.ok) break;
    const d = await r.json();
    (d.results || []).forEach((e) => out.push(e));
    url = d.next || null;
  }
  return out;
}

// Schedule a notetaker bot for a calendar event (branded tile + meeting_captions).
// Retries without the avatar if Recall rejects it, so scheduling never fails on the image.
export async function scheduleBotForEvent(eventId, { dedupKey, botName }) {
  const base = {
    deduplication_key: dedupKey,
    bot_config: {
      bot_name: botName || "OctoMeet AI Notetaker",
      recording_config: { transcript: { provider: { meeting_captions: {} } } },
    },
  };
  const withAvatar = JSON.parse(JSON.stringify(base));
  withAvatar.bot_config.automatic_video_output = { in_call_recording: { kind: "jpeg", b64_data: OCTO_AVATAR_JPEG_B64 } };

  let r = await fetch(`${BASE}/api/v2/calendar-events/${eventId}/bot/`, { method: "POST", headers: authHeaders(), body: JSON.stringify(withAvatar) });
  if (!r.ok) r = await fetch(`${BASE}/api/v2/calendar-events/${eventId}/bot/`, { method: "POST", headers: authHeaders(), body: JSON.stringify(base) });
  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
}

// Pull the bot id out of a scheduled calendar-event response.
export function botIdFromEvent(ev) {
  const bots = (ev && ev.bots) || [];
  const b = bots[bots.length - 1];
  return (b && (b.bot_id || b.id)) || null;
}
