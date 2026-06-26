// Returns the user's upcoming Google Calendar events (real data).
// Refreshes the access token if expired.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";

async function getToken(userId) {
  const r = await sb(`oauth_tokens?user_id=eq.${userId}&provider=eq.google&select=*`);
  return r[0];
}

export default async function handler(req, res) {
  try {
    const t = parseCookies(req).om_session;
    if (!t) return res.status(401).json({ error: "not authenticated" });
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t)}&select=user_id`);
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
          client_id: process.env.GOOGLE_CLIENT_ID,
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
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&maxResults=25&singleEvents=true&orderBy=startTime`;
    const cal = await fetch(url, { headers: { Authorization: `Bearer ${tk.access_token}` } }).then((r) => r.json());

    const events = (cal.items || []).map((e) => ({
      id: e.id,
      title: e.summary || "(no title)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      hangoutLink: e.hangoutLink || null,
      meetingUrl: e.hangoutLink || (e.conferenceData?.entryPoints?.[0]?.uri) || null,
      attendees: (e.attendees || []).length,
      organizer: e.organizer?.email || null,
    }));

    res.status(200).json({ events });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
