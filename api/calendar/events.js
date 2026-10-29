// Returns the user's upcoming Google Calendar events (real data).
// Refreshes the access token if expired.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { extractMeetingUrl, parseMeetingUrl, enabledPlatforms } from "../../shared/meeting-platform.js";

async function getToken(userId) {
  const r = await sb(`oauth_tokens?user_id=eq.${userId}&provider=eq.google&select=*`);
  return r[0];
}

export default async function handler(req, res) {
  try {
    const t = parseCookies(req).om_session;
    if (!t) return res.status(401).json({ error: "not authenticated" });
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "no session" });
    const userId = s[0].user_id;

    let tk = await getToken(userId);
    if (!tk) return res.status(400).json({ error: "no google token" });

    // Refresh if expired.
    if (new Date(tk.expiry) <= new Date() && tk.refresh_token) {
      const nt = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || "540014435995-d8rb5g8a9c4rv82vo4dtak9eoh3e2ufi.apps.googleusercontent.com",
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: tk.refresh_token,
          grant_type: "refresh_token",
        }),
      }).then((r) => r.json());
      if (nt.access_token) {
        tk.access_token = nt.access_token;
        await sb(`oauth_tokens?user_id=eq.${userId}&provider=eq.google`, {
          method: "PATCH",
          body: { access_token: nt.access_token, expiry: new Date(Date.now() + (nt.expires_in || 3600) * 1000).toISOString() },
        });
      }
    }

    const now = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&maxResults=25&singleEvents=true&orderBy=startTime&showHiddenInvitations=true&showDeleted=false`;
    const cal = await fetch(url, { headers: { Authorization: `Bearer ${tk.access_token}` } }).then((r) => r.json());
    if (cal.error) return res.status(401).json({ error: "calendar auth failed — please reconnect Google", detail: cal.error });

    // Keep availability separate from a bot that has actually been scheduled.
    const events = (cal.items || []).filter((e) => e.status !== "cancelled" &&
      !(e.attendees || []).some((a) => a.self && a.responseStatus === "declined")).map((e) => ({
      id: e.id,
      title: e.summary || "(no title)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      hangoutLink: e.hangoutLink || null,
      meetingUrl: extractMeetingUrl(e),
      attendees: (e.attendees || []).length,
      organizer: e.organizer?.email || null,
    }));

    const users = await sb(`app_users?id=eq.${userId}&select=auto_join`).catch(() => []);
    const ids = events.map(e => encodeURIComponent(`"${String(e.id).replace(/"/g, "")}"`)).join(",");
    const rows = ids ? await sb(`meetings?user_id=eq.${userId}&calendar_event_id=in.(${ids})&select=calendar_event_id,status&order=created_at.desc`) : [];
    const byEvent = new Map();
    for (const row of rows) if (!byEvent.has(row.calendar_event_id)) byEvent.set(row.calendar_event_id, row);
    const platforms = enabledPlatforms(process.env);
    for (const event of events) {
      let reason = event.meetingUrl ? null : "no_meeting_link";
      if (!reason) {
        try { if (!platforms.has(parseMeetingUrl(event.meetingUrl).platform)) reason = "platform_disabled"; }
        catch { reason = "invalid_meeting_url"; }
        if (!reason && !process.env.BOT_ORCHESTRATOR_URL) reason = "bot_backend_unavailable";
      }
      event.botAvailable = !reason;
      event.botUnavailableReason = reason;
      event.botStatus = byEvent.get(event.id)?.status || null;
      event.botEnabled = !reason && ["scheduled", "joining", "in_call", "recording"].includes(event.botStatus);
      event.autoJoinEligible = !byEvent.has(event.id) && !reason && !!users[0] && users[0].auto_join !== false;
    }
    res.status(200).json({ events });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
