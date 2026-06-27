// Connects the signed-in user's Google Calendar to Recall (Calendar V2) so Recall
// auto-syncs events and our calendar webhook schedules notetaker bots in real time.
// Also runs an initial sync so upcoming meetings get bots immediately on connect.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { createRecallCalendar, getRecallCalendar } from "../lib/recall-calendar.js";
import { syncRecallCalendar } from "../lib/schedule.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const uid = s[0].user_id;

    const u = (await sb(`app_users?id=eq.${uid}&select=recall_calendar_id,email,auto_join,notetaker_name`))[0] || {};
    if (u.auto_join === false) return res.status(200).json({ ok: true, autoJoin: false });

    let calendarId = u.recall_calendar_id;
    let connected = false;
    if (calendarId) {
      const cal = await getRecallCalendar(calendarId);
      if (cal && (cal.status === "connected" || cal.status === "connecting" || !cal.status)) connected = true;
      else calendarId = null;
    }
    if (!calendarId) {
      const tok = (await sb(`oauth_tokens?user_id=eq.${uid}&provider=eq.google&select=refresh_token`))[0];
      if (!tok || !tok.refresh_token) return res.status(400).json({ error: "no_refresh_token", hint: "log out and sign in with Google again" });
      const r = await createRecallCalendar(tok.refresh_token, u.email);
      if (!r.ok) return res.status(502).json({ error: "recall calendar error", detail: r.data });
      calendarId = r.data.id;
      await sb(`app_users?id=eq.${uid}`, { method: "PATCH", body: { recall_calendar_id: calendarId, recall_calendar_status: r.data.status || "connecting" } });
      connected = true;
    }

    // Initial sync: schedule bots for any already-synced upcoming meetings.
    let sync = { events: 0, scheduled: 0 };
    try { sync = await syncRecallCalendar(uid, calendarId, { botName: u.notetaker_name || "OctoMeet AI Notetaker" }); } catch (e) { /* webhook will cover it */ }
    res.status(200).json({ ok: true, calendar_id: calendarId, connected, ...sync });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
