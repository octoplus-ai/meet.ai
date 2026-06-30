// Mint/return the public share URL for a meeting (used by "Copy link" + the share email).
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { ensureShareToken } from "./lib/share.js";

const APP = "https://meet-ai-three-beige.vercel.app/";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!body.meetingId) return res.status(400).json({ error: "no meetingId" });
    const tok = await ensureShareToken(body.meetingId, s[0].user_id);
    if (!tok) return res.status(404).json({ error: "not found" });
    res.status(200).json({ token: tok, url: APP + "?share=" + tok });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
