// Lightweight existence check: which saved generations (AI doc / slide deck) already exist for a
// meeting, so the UI can default the button to "open the previous one" instead of regenerating.
// Never throws - returns {doc:false, deck:false} on any problem.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";
import { artifactKey } from "./lib/limits.js";

const enc = encodeURIComponent;

export default async function handler(req, res) {
  try {
    const body = req.method === "POST"
      ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}))
      : (req.query || {});
    let userId = null, meetingId = body.meetingId;

    const t = parseCookies(req).om_session;
    if (t) {
      const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
      if (s.length && meetingId) {
        const m = await sb(`meetings?id=eq.${enc(meetingId)}&user_id=eq.${enc(s[0].user_id)}&select=id`);
        if (m.length) userId = s[0].user_id; // owner of this meeting
      }
    }
    // Shared viewer: artifacts belong to the report OWNER, keyed by the meeting id.
    if (!userId && body.shareToken) {
      const r = await resolveShareToken(body.shareToken);
      if (r && r.meeting) { meetingId = r.meeting.id; userId = r.meeting.user_id; }
    }
    if (!userId || !meetingId) return res.status(200).json({ doc: false, deck: false });

    const akey = artifactKey([meetingId]);
    const rows = await sb(`artifacts?user_id=eq.${enc(userId)}&akey=eq.${enc(akey)}&select=kind`);
    const kinds = new Set((rows || []).map((r) => r.kind));
    return res.status(200).json({ doc: kinds.has("doc"), deck: kinds.has("deck") });
  } catch (e) {
    return res.status(200).json({ doc: false, deck: false });
  }
}
