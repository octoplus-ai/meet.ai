// Persist a manual edit to a report field (Summary / Action Items / Topics / etc.).
// Allowed for the Owner (session) OR an Editor (valid Editor share token). Viewers/none -> reject.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";

const ALLOWED = new Set(["summary", "next_steps", "topics", "action_items", "key_questions", "highlights", "chapters"]);

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!body.meetingId || !ALLOWED.has(body.field)) return res.status(400).json({ error: "bad request" });
    let allowed = false;
    const t = parseCookies(req).om_session;
    if (t) {
      const s = await sb(`sessions?token=eq.${encodeURIComponent(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
      if (s.length) {
        const m = await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}&user_id=eq.${s[0].user_id}&select=id`);
        if (m.length) allowed = true;
      }
    }
    if (!allowed && body.shareToken) {
      const r = await resolveShareToken(body.shareToken);
      if (r && r.role === "Editor" && r.meeting.id === body.meetingId) allowed = true;
    }
    if (!allowed) return res.status(403).json({ error: "not authorized" });
    await sb(`reports?meeting_id=eq.${encodeURIComponent(body.meetingId)}`, { method: "PATCH", body: { [body.field]: body.value } });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
