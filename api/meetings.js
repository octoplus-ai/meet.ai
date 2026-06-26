// Returns the current user's real meetings (with their reports) from Supabase.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

export default async function handler(req, res) {
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ meetings: [], error: "not authenticated" });
    const m = await sb(`meetings?user_id=eq.${s[0].user_id}&select=*,reports(*)&order=created_at.desc`);
    res.status(200).json({ meetings: m });
  } catch (e) {
    console.error("meetings error:", e && (e.message || e));
    res.status(500).json({ meetings: [], error: "failed to load meetings" });
  }
}
