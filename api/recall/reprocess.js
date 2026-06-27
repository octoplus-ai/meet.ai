// Re-generate the AI report for a meeting from its Recall recording.
// POST { meetingId } regenerates that meeting; POST {} reprocesses all the
// caller's meetings that have a bot but no/empty report. Auth-gated by session.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { processMeeting } from "../lib/process.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const userId = s[0].user_id;

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    let targets;
    if (body.meetingId) {
      targets = await sb(`meetings?id=eq.${body.meetingId}&user_id=eq.${userId}&select=*`);
    } else {
      targets = await sb(`meetings?user_id=eq.${userId}&bot_id=not.is.null&select=*&order=created_at.desc&limit=10`);
    }
    if (!targets.length) return res.status(404).json({ error: "no meeting found" });

    const results = [];
    for (const m of targets) {
      if (!m.bot_id) { results.push({ id: m.id, skipped: "no bot" }); continue; }
      try {
        const r = await processMeeting(m, { force: true });
        results.push({ id: m.id, title: m.title, ...r });
      } catch (e) {
        results.push({ id: m.id, error: String(e.message || e) });
      }
    }
    res.status(200).json({ ok: true, processed: results.length, results });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
