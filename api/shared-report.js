// PUBLIC read-only report by share token. No login required - the unguessable token IS
// the access grant (anyone-with-the-link). Returns ONLY the one meeting it points to.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";

const maskEmail = (e) => { const [u, d] = String(e || "").split("@"); return (u ? u[0] + "•••" : "•••") + "@" + (d || ""); };

// NEVER hand tokens to a share viewer: the raw row carries every per-person token (and the
// meeting-level share_token) inside shares[] - returning them lets any Viewer replay an
// Editor's token. Keep only the display fields the shared UI needs.
function sanitizeShared(m) {
  if (!m || typeof m !== "object") return m;
  const out = { ...m };
  delete out.share_token;
  out.shares = (Array.isArray(m.shares) ? m.shares : []).map((s) => ({
    email: s && s.email, name: (s && s.name) || "", role: (s && s.role) || "Viewer", picture: (s && s.picture) || "",
  }));
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const token = new URL(req.url, "http://x").searchParams.get("token");
    if (!token) return res.status(400).json({ error: "no token" });
    // 1) Per-person token -> carries a role (Viewer/Editor). Restricted: require an email-OTP
    //    (verified cookie) before returning the report, unless this browser already verified.
    const r = await resolveShareToken(token);
    if (r) {
      if (r.email && parseCookies(req)["om_v_" + token] !== "1") {
        return res.status(403).json({ needOtp: true, emailHint: maskEmail(r.email) });
      }
      return res.status(200).json({ meeting: sanitizeShared(r.meeting), role: r.role, email: r.email });
    }
    // 2) Meeting-level "anyone with the link" token -> Viewer only. Honors the owner's Link
    //    Access setting: while restricted, the public token is disabled (per-person tokens
    //    above keep working) and starts working again the moment the owner flips it public.
    const rows = await sb(`meetings?share_token=eq.${encodeURIComponent(token)}&select=*,reports(*)`);
    if (rows.length) {
      if (rows[0].link_access === "restricted") return res.status(403).json({ error: "link restricted" });
      return res.status(200).json({ meeting: sanitizeShared(rows[0]), role: "Viewer" });
    }
    return res.status(404).json({ error: "not found" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
