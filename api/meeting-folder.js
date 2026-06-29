// Set (or clear) the folder of a meeting — manual override of the AI auto-classification.
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
    if (!body.meetingId) return res.status(400).json({ error: "no meetingId" });
    const folder = typeof body.folder === "string" ? body.folder.trim().slice(0, 60) : null;
    await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}&user_id=eq.${uid}`, { method: "PATCH", body: { folder: folder || null } });
    res.status(200).json({ ok: true, folder: folder || null });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
