// Persist a manual edit to a report field (Summary / Action Items / Topics / etc.).
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

const ALLOWED = new Set(["summary", "next_steps", "topics", "action_items", "key_questions", "highlights", "chapters"]);

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const uid = s[0].user_id;
    if (!body.meetingId || !ALLOWED.has(body.field)) return res.status(400).json({ error: "bad request" });
    const m = await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}&user_id=eq.${uid}&select=id`);
    if (!m.length) return res.status(404).json({ error: "not found" });
    await sb(`reports?meeting_id=eq.${encodeURIComponent(body.meetingId)}`, { method: "PATCH", body: { [body.field]: body.value } });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
