// Per-person report access list (Viewer/Editor) persisted in meetings.shares jsonb.
// GET ?meetingId -> { shares:[{email,role,name}] } ; POST {meetingId,email,role} upsert ;
// POST {meetingId,email,remove:true} removes. Owner-only.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

async function owner(req, meetingId) {
  const t = parseCookies(req).om_session;
  const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  if (!s.length) return null;
  const m = await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${s[0].user_id}&select=id,shares`);
  return m.length ? { uid: s[0].user_id, shares: Array.isArray(m[0].shares) ? m[0].shares : [] } : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET") {
      const meetingId = url.searchParams.get("meetingId");
      const o = await owner(req, meetingId);
      if (!o) return res.status(401).json({ error: "not authorized" });
      return res.status(200).json({ shares: o.shares });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const { meetingId, email } = body;
      if (!meetingId || !email) return res.status(400).json({ error: "bad request" });
      const o = await owner(req, meetingId);
      if (!o) return res.status(401).json({ error: "not authorized" });
      const e = String(email).trim().toLowerCase();
      let shares = o.shares.filter((s) => (s.email || "").toLowerCase() !== e);
      if (!body.remove) shares.push({ email: e, role: body.role === "Editor" ? "Editor" : "Viewer", name: body.name || "" });
      await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${o.uid}`, { method: "PATCH", body: { shares } });
      return res.status(200).json({ ok: true, shares });
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
