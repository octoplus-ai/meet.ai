// Returns a fresh Google OAuth access token for the signed-in user so the Meet
// Add-on (browser) can call the Meet REST API + Media API (spaces.get,
// connectActiveConference). Auth via the OctoMeet session token (Bearer or cookie).
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { getValidToken } from "../lib/google.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const auth = req.headers.authorization || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    const t = bearer || parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });

    const token = await getValidToken(s[0].user_id);
    if (!token) return res.status(400).json({ error: "no_google_token", hint: "re-connect Google (Media API scopes)" });
    res.status(200).json({ access_token: token });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
