// Refresh one saved transcript per request. Reads never generate reports, and
// durable leases/cooldowns prevent multiple tabs from repeatedly paying for it.
import { randomUUID } from 'node:crypto';
import { sb } from './lib/supa.js';
import { parseCookies } from './lib/session.js';
import { reanalyzeStored, ANALYSIS_VERSION } from './lib/process.js';
import { isRtmsDeleting } from './lib/share.js';
import { zoomRequestOrigin } from './lib/zoom-security.js';

export const config = { maxDuration: 300 };
const LEASE_MS = 5 * 60000, RETRY_MS = 15 * 60000, MAX_ATTEMPTS = 3;
const enc = encodeURIComponent;
const stageFilter = stage => stage == null ? 'stage_info=is.null' : `stage_info=eq.${enc(JSON.stringify(stage))}`;
const reportOf = row => Array.isArray(row.reports) ? row.reports[0] : row.reports;
const analysisOf = row => row.stage_info?.reportAnalysis?.version === ANALYSIS_VERSION ? row.stage_info.reportAnalysis : {};
function eligible(row, now) {
  const state = analysisOf(row);
  return (state.attempts || 0) < MAX_ATTEMPTS && !(Date.parse(state.leaseUntil || '') > now) && !(Date.parse(state.retryAfter || '') > now);
}

export function createReprocessHandler({ database = sb, analyze = reanalyzeStored, now = Date.now, makeLease = randomUUID,
  validateOrigin = req => req.headers.origin === zoomRequestOrigin(req) } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
    try {
      try { if (!validateOrigin(req)) throw new Error(); } catch { return res.status(403).json({ error: 'invalid_origin' }); }
      const token = parseCookies(req).om_session;
      const session = await database(`sessions?token=eq.${enc(token || '')}&expires_at=gt.${enc(new Date(now()).toISOString())}&select=user_id`);
      if (!session?.length) return res.status(401).json({ error: 'not authenticated' });
      if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ updated: 0, remaining: 0 });
      const uid = session[0].user_id;
      const rows = await database(`meetings?user_id=eq.${enc(uid)}&status=eq.done&select=id,user_id,title,attendees,status,capture_mode,stage_info,reports(report_version,summary,transcript)&order=created_at.desc`);
      const stale = rows.filter(row => {
        if (isRtmsDeleting(row)) return false;
        const report = reportOf(row);
        return report && typeof report.transcript === 'string' && report.transcript.trim().length >= 40
          && ((report.report_version || 0) < ANALYSIS_VERSION || !(typeof report.summary === 'string' && report.summary.trim()));
      });
      const candidates = stale.filter(row => eligible(row, now()));
      const exhausted = stale.filter(row => (analysisOf(row).attempts || 0) >= MAX_ATTEMPTS).length;
      if (!candidates.length) return res.status(200).json({ updated: 0, remaining: 0, pending: stale.length > exhausted, failed: exhausted, version: ANALYSIS_VERSION });
      const meeting = candidates[0], lease = makeLease(), prior = analysisOf(meeting);
      const analysis = { version: ANALYSIS_VERSION, lease, leaseUntil: new Date(now() + LEASE_MS).toISOString(), attempts: (prior.attempts || 0) + 1, state: 'running' };
      const stage = { ...(meeting.stage_info || {}), reportAnalysis: analysis };
      const base = `meetings?id=eq.${enc(meeting.id)}&user_id=eq.${enc(uid)}&status=eq.done`;
      const claimed = await database(`${base}&${stageFilter(meeting.stage_info)}`, { method: 'PATCH', prefer: 'return=representation', body: { stage_info: stage } });
      if (!claimed?.length) return res.status(200).json({ updated: 0, remaining: 0, pending: true, version: ANALYSIS_VERSION });
      const current = async () => (await database(`${base}&select=id,user_id,status,capture_mode,stage_info`))?.[0];
      const beforeSave = async () => {
        const row = await current();
        return !!row && !isRtmsDeleting(row) && row.stage_info?.reportAnalysis?.lease === lease && Date.parse(row.stage_info.reportAnalysis.leaseUntil) > now();
      };
      let result, failure;
      try {
        result = await analyze({ ...meeting, stage_info: stage }, { timeoutMs: 180000, beforeSave });
        if (!result?.ok) failure = result?.skipped === 'report changed' || result?.skipped === 'analysis lease changed' ? 'ANALYSIS_CONFLICT' : 'ANALYSIS_UNAVAILABLE';
      } catch (error) { failure = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'ANALYSIS_TIMEOUT' : 'ANALYSIS_UNAVAILABLE'; }
      // Preserve concurrent stage metadata and never release another worker's lease.
      try {
        const row = await current();
        if (row && !isRtmsDeleting(row) && row.stage_info?.reportAnalysis?.lease === lease) {
          const finished = { version: ANALYSIS_VERSION, attempts: analysis.attempts, state: failure ? 'failed' : 'complete', finishedAt: new Date(now()).toISOString(),
            ...(failure ? { error: failure, retryAfter: new Date(now() + RETRY_MS).toISOString() } : {}) };
          await database(`${base}&${stageFilter(row.stage_info)}`, { method: 'PATCH', body: { stage_info: { ...row.stage_info, reportAnalysis: finished } } });
        }
      } catch { /* The lease expires safely; do not log private database/provider bodies. */ }
      return res.status(200).json({ updated: failure ? 0 : 1, remaining: candidates.length - 1, ...(failure ? { failed: 1, retryAfterMs: RETRY_MS } : {}), version: ANALYSIS_VERSION });
    } catch { return res.status(503).json({ error: 'reprocessing_unavailable' }); }
  };
}
export default createReprocessHandler();
