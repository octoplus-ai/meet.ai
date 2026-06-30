// Delete a meeting and its report (from the reports list "⋯ → Delete Report").
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
    const id = encodeURIComponent(body.meetingId);
    // Verify ownership before deleting.
    const own = await sb(`meetings?id=eq.${id}&user_id=eq.${uid}&select=id`);
    if (!own.length) return res.status(404).json({ error: "not found" });
    await sb(`reports?meeting_id=eq.${id}`, { method: "DELETE" });
    await sb(`meetings?id=eq.${id}&user_id=eq.${uid}`, { method: "DELETE" });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
