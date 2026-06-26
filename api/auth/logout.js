// Clears the session cookie and deletes the session row.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";

export default async function handler(req, res) {
  try {
    const t = parseCookies(req).om_session;
    if (t) await sb(`sessions?token=eq.${encodeURIComponent(t)}`, { method: "DELETE" });
  } catch (e) { /* ignore */ }
  res.setHeader("Set-Cookie", "om_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  res.status(200).json({ ok: true });
}
