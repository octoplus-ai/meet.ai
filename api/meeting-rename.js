// Rename a meeting (its report title) - manual edit from the reports list.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const uid = s[0].user_id;
    const title = (body.title || "").trim().slice(0, 200);
    if (!body.meetingId || !title) return res.status(400).json({ error: "bad request" });
    await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}&user_id=eq.${uid}`, { method: "PATCH", body: { title } });
    res.status(200).json({ ok: true, title });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
