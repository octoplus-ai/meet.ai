// PUBLIC read-only report by share token. No login required - the unguessable token IS
// the access grant (anyone-with-the-link). Returns ONLY the one meeting it points to.
import { sb } from "./lib/supa.js";
import { resolveShareToken } from "./lib/share.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = new URL(req.url, "http://x").searchParams.get("token");
    if (!token) return res.status(400).json({ error: "no token" });
    // 1) Per-person token -> carries a role (Viewer/Editor).
    const r = await resolveShareToken(token);
    if (r) return res.status(200).json({ meeting: r.meeting, role: r.role, email: r.email });
    // 2) Legacy "anyone with the link" token -> Viewer only.
    const rows = await sb(`meetings?share_token=eq.${encodeURIComponent(token)}&select=*,reports(*)`);
    if (rows.length) return res.status(200).json({ meeting: rows[0], role: "Viewer" });
    return res.status(404).json({ error: "not found" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
