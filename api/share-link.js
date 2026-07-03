// Mint/return the public share URL for a meeting (used by "Copy link" + the share email),
// and persist the owner's Link Access choice (public / restricted). The token always exists
// once copied; shared-report.js enforces link_access, so a restricted link simply 403s until
// the owner flips it public - same URL, Google Docs semantics.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { ensureShareToken } from "./lib/share.js";

const APP = (process.env.APP_URL || "https://meet.octoplusteam.com").replace(/\/+$/, "") + "/";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!body.meetingId) return res.status(400).json({ error: "no meetingId" });

    if (body.setAccess === "public" || body.setAccess === "restricted") {
      await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}&user_id=eq.${s[0].user_id}`, {
        method: "PATCH", body: { link_access: body.setAccess },
      });
      if (!body.copy) return res.status(200).json({ ok: true, access: body.setAccess });
    }

    const tok = await ensureShareToken(body.meetingId, s[0].user_id);
    if (!tok) return res.status(404).json({ error: "not found" });
    res.status(200).json({ token: tok, url: APP + "?share=" + tok });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
