import { randomUUID } from 'node:crypto';
import { sb } from '../lib/supa.js';
import { authorizeRtmsCallback } from '../lib/zoom-rtms.js';
import { rtmsMedia, rtmsTurns, rtmsTranscript, rtmsRoster, rtmsReport } from '../lib/zoom-delivery.js';
import { analyzeTranscript, sanitizeSpeakerMap, ANALYSIS_VERSION, notifyParticipants } from '../lib/process.js';
export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '2mb' } } };
// Dependencies are injectable for offline integration tests; production always uses existing analysis.
export function createRtmsIngest({ database = sb, authorize = authorizeRtmsCallback, analyze = analyzeTranscript, notify = notifyParticipants } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    let session, lease;
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const authorized = await authorize(req, body); session = authorized.session; const meeting = authorized.meeting;
      const media = rtmsMedia(body, session);
      if (session.delivered_at) return res.status(200).json({ ok: true, alreadyDone: true, meeting_id: session.meeting_id });
      // Persist real media before expensive analysis, without overwriting canceled/finalized meetings.
      const saved = await database('rpc/zoom_session_update', { method: 'POST', body: { p_session_id: session.id, p_status: 'processing', p_error: null, p_media: media } });
      if (!saved?.ok || saved.alreadyDone || meeting.status === 'skipped') return res.status(409).json({ error: 'zoom_capture_conflict', stop: true, ...(saved?.delete === true ? { delete: true } : {}) });
      if (body.mediaOnly === true) return res.status(200).json({ ok: true, mediaSaved: true, meeting_id: session.meeting_id });
      const turns = rtmsTurns(body), roster = rtmsRoster(body);
      if (!turns.length) {
        await database('rpc/zoom_session_update', { method: 'POST', body: { p_session_id: session.id, p_status: 'error', p_error: 'RTMS_NO_SPEECH', p_media: media } });
        return res.status(200).json({ ok: true, noTranscript: true, mediaSaved: !!media.recording_url, meeting_id: session.meeting_id });
      }
      lease = randomUUID();
      const claimed = await database('rpc/zoom_claim_ingest', { method: 'POST', body: { p_session_id: session.id, p_lease: lease } });
      if (!claimed?.length) { lease = null; res.setHeader('Retry-After', '15'); return res.status(503).json({ error: 'zoom_ingest_pending' }); }
      const hints = [...new Set([...roster, ...(meeting.attendees || []).map(x => x?.name || x?.email).filter(Boolean)])];
      const ai = await analyze(rtmsTranscript(turns), meeting.title || 'Zoom meeting', hints);
      const report = rtmsReport(ai, turns, roster, sanitizeSpeakerMap(ai.speakerMap), ANALYSIS_VERSION);
      const committed = await database('rpc/zoom_commit_report', { method: 'POST', body: { p_session_id: session.id, p_lease: lease, p_report: report, p_media: media } });
      if (!committed) return res.status(409).json({ error: 'zoom_capture_conflict', stop: true });
      lease = null;
      const current = (await database(`meetings?id=eq.${session.meeting_id}&user_id=eq.${session.user_id}&capture_mode=eq.zoom_rtms&select=*&limit=1`))?.[0];
      if (!current || current.status !== 'done' || current.stage_info?.rtmsSessionId !== session.id || current.stage_info?.deletion) return res.status(409).json({ error: 'zoom_capture_conflict', stop: true, ...(current?.stage_info?.deletion ? { delete: true } : {}) });
      // Existing idempotent post-report preferences apply only after the transaction commits.
      await notify(current, ai, { ...report, meeting_id: session.meeting_id, user_id: session.user_id });
      return res.status(200).json({ ok: true, meeting_id: session.meeting_id });
    } catch (error) {
      const safe = ['unauthorized','zoom_capture_conflict','invalid_media','invalid_duration','invalid_transcript'];
      return res.status(safe.includes(error.code) ? error.status : 503).json({ error: safe.includes(error.code) ? error.code : 'zoom_ingest_retry', ...(['unauthorized','zoom_capture_conflict'].includes(error.code) ? { stop: true } : {}), ...(error.delete === true ? { delete: true } : {}) });
    } finally {
      if (session && lease) await database(`zoom_rtms_sessions?id=eq.${session.id}&ingest_lease=eq.${lease}`, { method: 'PATCH', body: { ingest_lease: null, ingest_lease_until: null } }).catch(() => {});
    }
  };
}
export default createRtmsIngest();
