// Returns the current user's real meetings (with their reports) from Supabase.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

export default async function handler(req, res) {
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&select=user_id`);
    if (!s.length) return res.status(200).json({ meetings: [] });
    const m = await sb(`meetings?user_id=eq.${s[0].user_id}&select=*,reports(*)&order=created_at.desc`);
    res.status(200).json({ meetings: m });
  } catch (e) {
    res.status(200).json({ meetings: [], error: String(e.message || e) });
  }
}
