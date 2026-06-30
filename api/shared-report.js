// PUBLIC read-only report by share token. No login required - the unguessable token IS
// the access grant (anyone-with-the-link). Returns ONLY the one meeting it points to.
import { sb } from "./lib/supa.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = new URL(req.url, "http://x").searchParams.get("token");
    if (!token) return res.status(400).json({ error: "no token" });
    const rows = await sb(`meetings?share_token=eq.${encodeURIComponent(token)}&select=*,reports(*)`);
    if (!rows.length) return res.status(404).json({ error: "not found" });
    // Return the raw meeting row (with its report) so the client can render it with the
    // same adapter it uses everywhere. Only this single meeting is exposed.
    res.status(200).json({ meeting: rows[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
