// Per-person report access list (Viewer/Editor) persisted in meetings.shares jsonb.
// Each entry: { email, role, name, token }. Token -> the person's role-bearing share link.
// Authorized for the Owner (session) OR an Editor (valid Editor share token).
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { randomToken } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";

const arr = (x) => (Array.isArray(x) ? x : []);

// Returns { shares, ownerId } if the caller may manage access for this meeting, else null.
async function authorize(req, meetingId, shareToken) {
  const t = parseCookies(req).om_session;
  if (t) {
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (s.length) {
      const m = await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${s[0].user_id}&select=id,shares,user_id`);
      if (m.length) return { shares: arr(m[0].shares), ownerId: m[0].user_id };
    }
  }
  if (shareToken) {
    const r = await resolveShareToken(shareToken);
    if (r && r.role === "Editor" && r.meeting.id === meetingId) return { shares: arr(r.meeting.shares), ownerId: r.meeting.user_id };
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET") {
      const meetingId = url.searchParams.get("meetingId");
      const a = await authorize(req, meetingId, url.searchParams.get("shareToken"));
      if (!a) return res.status(401).json({ error: "not authorized" });
      return res.status(200).json({ shares: a.shares });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const { meetingId, email } = body;
      if (!meetingId || !email) return res.status(400).json({ error: "bad request" });
      const a = await authorize(req, meetingId, body.shareToken);
      if (!a) return res.status(401).json({ error: "not authorized" });
      const e = String(email).trim().toLowerCase();
      const existing = a.shares.find((s) => (s.email || "").toLowerCase() === e);
      let shares = a.shares.filter((s) => (s.email || "").toLowerCase() !== e);
      if (!body.remove) {
        shares.push({ email: e, role: body.role === "Editor" ? "Editor" : "Viewer", name: body.name || (existing && existing.name) || "", picture: (existing && existing.picture) || "", token: (existing && existing.token) || randomToken(), magic: (existing && existing.magic) || randomToken() });
      }
      await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}`, { method: "PATCH", body: { shares } });
      return res.status(200).json({ ok: true, shares });
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
