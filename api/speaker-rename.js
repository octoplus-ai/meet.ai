// Rename a speaker across a meeting's report (transcript turns, participants, talk-time rows,
// action-item owners) - like Read.ai. Prefix-anchored rewrite: only "Name:" turn prefixes are
// touched, never quoted mentions inside the dialogue text. Owner or per-person Editor token.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";

const enc = encodeURIComponent;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { meetingId } = body;
    const from = String(body.from || "").trim();
    const to = String(body.to || "").trim();
    if (!meetingId || !from || !to || to.length > 80) return res.status(400).json({ error: "meetingId, from, to required" });
    if (from === to) return res.status(200).json({ ok: true, unchanged: true });

    // Auth: session owner, or an Editor share token for this same meeting.
    let allowed = false;
    const t = parseCookies(req).om_session;
    if (t) {
      const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
      if (s.length) {
        const own = await sb(`meetings?id=eq.${enc(meetingId)}&user_id=eq.${s[0].user_id}&select=id`);
        allowed = own.length > 0;
      }
    }
    if (!allowed && body.shareToken) {
      const r = await resolveShareToken(body.shareToken);
      allowed = !!(r && r.role === "Editor" && r.meeting && r.meeting.id === meetingId);
    }
    if (!allowed) return res.status(403).json({ error: "not allowed" });

    const reps = await sb(`reports?meeting_id=eq.${enc(meetingId)}&select=transcript,participants,action_items`);
    if (!reps.length) return res.status(404).json({ error: "no report" });
    const rep = reps[0];

    // Turn prefixes only: start of line, optional "[m:ss] " stamp, then the exact old name + ":".
    const rx = new RegExp(`^((?:\\[[^\\]\\n]*\\]\\s*)?)${esc(from)}:`, "gm");
    const transcript = String(rep.transcript || "").replace(rx, `$1${to}:`);
    const participants = (Array.isArray(rep.participants) ? rep.participants : []).map((p) =>
      (p && p.name === from ? { ...p, name: to } : p));
    const actionItems = (Array.isArray(rep.action_items) ? rep.action_items : []).map((a) =>
      (a && a.owner === from ? { ...a, owner: to } : a));

    // Cached subtitle cues have the old name baked in - drop them so they regenerate.
    await sb(`reports?meeting_id=eq.${enc(meetingId)}`, {
      method: "PATCH",
      body: { transcript, participants, action_items: actionItems, subtitles: null },
    });
    const m = await sb(`meetings?id=eq.${enc(meetingId)}&select=participants`);
    if (m.length && Array.isArray(m[0].participants)) {
      await sb(`meetings?id=eq.${enc(meetingId)}`, {
        method: "PATCH",
        body: { participants: m[0].participants.map((n) => (n === from ? to : n)) },
      });
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("speaker-rename error:", e && (e.stack || e.message));
    res.status(500).json({ error: String(e.message || e) });
  }
}
