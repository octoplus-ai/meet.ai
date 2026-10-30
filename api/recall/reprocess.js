// Re-generate the AI report for a meeting from its Recall recording.
// POST { meetingId } regenerates that meeting; POST {} reprocesses all the
// caller's meetings that have a bot but no/empty report. Auth-gated by session.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { usesRecall } from '../lib/processing-state.js';
import { zoomRequestOrigin } from '../lib/zoom-security.js';
import { recoverRecallMeeting, recallRecoveryEligible } from '../lib/recall-recovery.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    try { if (req.headers.origin !== zoomRequestOrigin(req)) throw new Error(); } catch { return res.status(403).json({ error: 'invalid_origin' }); }
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const userId = s[0].user_id;

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (body.meetingId != null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.meetingId)) return res.status(400).json({ error: 'invalid_meeting_id' });
    let targets;
    if (body.meetingId) {
      targets = await sb(`meetings?id=eq.${body.meetingId}&user_id=eq.${userId}&select=*`);
    } else {
      targets = await sb(`meetings?user_id=eq.${userId}&bot_id=not.is.null&or=(capture_mode.is.null,capture_mode.eq.recall)&status=in.(processing,error,done)&select=*,reports(id,summary,transcript)&order=created_at.desc&limit=25`);
    }
    if (!targets.length) return res.status(404).json({ error: "no meeting found" });

    targets = targets.filter(usesRecall).filter(m => body.meetingId || recallRecoveryEligible(m));
    const remaining = Math.max(0, targets.length - 1);
    targets = targets.slice(0, 1); // one bounded generation, never ten sequential provider calls

    const results = [];
    for (const m of targets) {
      if (!m.bot_id) { results.push({ id: m.id, skipped: "no bot" }); continue; }
      try {
        const r = await recoverRecallMeeting(m, { force: !!body.meetingId });
        results.push({ id: m.id, title: m.title, ...r });
      } catch (e) {
        results.push({ id: m.id, error: 'REPROCESSING_UNAVAILABLE' });
      }
    }
    res.status(200).json({ ok: true, processed: results.length, remaining, results });
  } catch (e) {
    res.status(503).json({ error: 'reprocessing_unavailable' });
  }
}
