// Schedules a Recall bot for ALL of the signed-in user's upcoming calendar
// meetings (Read.ai-style auto-join). Safe to call repeatedly — dedups per event.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { armUserCalendar } from "../lib/schedule.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const uid = s[0].user_id;

    const u = await sb(`app_users?id=eq.${uid}&select=auto_join,notetaker_name`);
    if (u[0] && u[0].auto_join === false) return res.status(200).json({ ok: true, autoJoin: false, armed: 0 });
    // V1 and V2 coexist safely: scheduleBot dedups on meeting_url so no meeting gets two bots.

    const result = await armUserCalendar(uid, { botName: (u[0] && u[0].notetaker_name) || "OctoMeet AI", days: 7 });
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
