// Google Calendar helpers: get a valid (refreshed) access token and list events.
import { sb } from "./supa.js";

export async function getValidToken(userId) {
  const r = await sb(`oauth_tokens?user_id=eq.${userId}&provider=eq.google&select=*`);
  let tk = r[0];
  if (!tk) return null;
  // Treat a missing expiry as expired (never trust a stale token), and refresh when we can.
  const expired = !tk.expiry || new Date(tk.expiry) <= new Date();
  if (expired && tk.refresh_token) {
    const nt = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "540014435995-d8rb5g8a9c4rv82vo4dtak9eoh3e2ufi.apps.googleusercontent.com",
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: tk.refresh_token,
        grant_type: "refresh_token",
      }),
    }).then((x) => x.json());
    if (nt.access_token) {
      tk.access_token = nt.access_token;
      await sb(`oauth_tokens?user_id=eq.${userId}&provider=eq.google`, {
        method: "PATCH",
        body: { access_token: nt.access_token, expiry: new Date(Date.now() + (nt.expires_in || 3600) * 1000).toISOString() },
      });
    } else {
      console.error("[google] token refresh failed:", JSON.stringify(nt));
      // Do NOT hand back the stale token: callers treat any truthy token as "connected" and
      // would send doomed 401 requests instead of falling back (e.g. bot sender -> owner Gmail).
      return null;
    }
  } else if (expired) {
    return null; // expired and no refresh token -> effectively disconnected
  }
  return tk.access_token || null;
}

// Adds/updates an OctoMeet note block in a calendar event's description.
// Best-effort: silently no-ops if write scope wasn't granted or the user can't edit.
const MARK_START = "\n\n— OctoMeet AI —\n";
export async function annotateEvent(userId, eventId, note) {
  try {
    const token = await getValidToken(userId);
    if (!token || !eventId) return false;
    const base = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
    const ev = await fetch(base, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    if (!ev || ev.error) return false;
    let desc = ev.description || "";
    const idx = desc.indexOf(MARK_START);
    if (idx >= 0) desc = desc.slice(0, idx); // replace prior OctoMeet block
    desc = `${desc}${MARK_START}${note}`;
    const r = await fetch(base, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc }),
    });
    return r.ok;
  } catch (e) { return false; }
}

// The people ACTUALLY on a meeting's calendar invite: [{email, name, responseStatus, organizer}].
// This is where a participant's email lives (Recall/diarization only gives us names). Filters out
// room/resource attendees; always includes the organizer so the host is never missing. [] on failure.
export async function getEventAttendees(userId, eventId) {
  try {
    const token = await getValidToken(userId);
    if (!token || !eventId) return [];
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
    const ev = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    if (!ev || ev.error) return [];
    const out = (ev.attendees || [])
      .filter((a) => a && a.email && !a.resource)
      .map((a) => ({ email: String(a.email).toLowerCase(), name: a.displayName || "", responseStatus: a.responseStatus || "", organizer: !!a.organizer }));
    const org = ev.organizer && ev.organizer.email;
    if (org && !out.some((a) => a.email === String(org).toLowerCase())) {
      out.push({ email: String(org).toLowerCase(), name: (ev.organizer && ev.organizer.displayName) || "", responseStatus: "accepted", organizer: true });
    }
    return out;
  } catch (e) { return []; }
}

// Returns normalized upcoming events in [now, now + days].
export async function listUpcomingEvents(userId, { days = 7 } = {}) {
  const token = await getValidToken(userId);
  if (!token) return { error: "no token", events: [] };
  const now = new Date();
  const max = new Date(now.getTime() + days * 86400000);
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(max.toISOString())}&maxResults=50&singleEvents=true&orderBy=startTime`;
  const cal = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  if (cal.error) return { error: "calendar auth failed", events: [] };
  const events = (cal.items || []).map((e) => ({
    id: e.id,
    title: e.summary || "(no title)",
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    meetingUrl: e.hangoutLink || (e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri) || (e.conferenceData?.entryPoints?.[0]?.uri) || null,
    attendees: (e.attendees || []).length,
    organizer: e.organizer?.email || null,
    selfDeclined: (e.attendees || []).some((a) => a.self && a.responseStatus === "declined"),
  }));
  return { events };
}
