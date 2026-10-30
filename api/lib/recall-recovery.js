import { randomUUID } from 'node:crypto';
import { sb } from './supa.js';
import { processMeeting } from './process.js';
import { usesRecall, hasCompleteReport } from './processing-state.js';

const enc = encodeURIComponent;
const MAX_ATTEMPTS = 3, LEASE_MS = 5 * 60000, RETRY_MS = 15 * 60000;
const stageFilter = stage => stage == null ? 'stage_info=is.null' : `stage_info=eq.${enc(JSON.stringify(stage))}`;
const stateOf = meeting => meeting.stage_info?.recallRecovery?.botId === meeting.bot_id ? meeting.stage_info.recallRecovery : {};
export function recallRecoveryEligible(meeting, now = Date.now()) {
  const state = stateOf(meeting);
  return usesRecall(meeting) && ['processing', 'error', 'done'].includes(meeting.status) && !hasCompleteReport(meeting)
    && (state.attempts || 0) < MAX_ATTEMPTS && !(Date.parse(state.leaseUntil || '') > now) && !(Date.parse(state.retryAfter || '') > now);
}

// The webhook and explicit POST recovery share one durable lease. Listing never
// generates AI. The original report writer still owns persistence and recap delivery.
export function createRecallRecovery({ database = sb, process = processMeeting, now = Date.now, makeLease = randomUUID } = {}) {
  return async function recover(meeting, { force = false, transcriptEvent = false } = {}) {
    if (!usesRecall(meeting)) return { state: 'skipped', skipped: 'not a Recall capture' };
    const base = `meetings?id=eq.${enc(meeting.id)}&user_id=eq.${enc(meeting.user_id)}&bot_id=eq.${enc(meeting.bot_id)}`
      + (meeting.capture_mode == null ? '&capture_mode=is.null' : `&capture_mode=eq.${enc(meeting.capture_mode)}`);
    const current = async () => (await database(`${base}&select=*,reports(*)`))?.[0];
    const source = await current();
    if (!source || source.status === 'skipped' || (!transcriptEvent && !['processing', 'error', 'done'].includes(source.status))) return { state: 'skipped', skipped: 'capture changed' };
    if (!force && hasCompleteReport(source) && source.status === 'done') return { state: 'complete', skipped: 'already done' };
    const previous = stateOf(source);
    if (Date.parse(previous.leaseUntil || '') > now()) return { state: 'pending', retryAfter: 60 };
    if ((previous.attempts || 0) >= MAX_ATTEMPTS) return { state: 'limited', error: 'RECALL_RECOVERY_LIMIT' };
    if (Date.parse(previous.retryAfter || '') > now()) return { state: 'pending', retryAfter: Math.max(1, Math.ceil((Date.parse(previous.retryAfter) - now()) / 1000)) };
    const lease = makeLease(), attempts = (previous.attempts || 0) + 1;
    const stage = { ...(source.stage_info || {}), recallRecovery: { botId: source.bot_id, lease, attempts, state: 'running', leaseUntil: new Date(now() + LEASE_MS).toISOString() } };
    const claimed = await database(`${base}&status=eq.${enc(source.status)}&${stageFilter(source.stage_info)}`, {
      method: 'PATCH', prefer: 'return=representation', body: { stage_info: stage },
    });
    if (!claimed?.length) return { state: 'pending', retryAfter: 60 };
    let result, failure, retryAfter = RETRY_MS / 1000;
    try {
      result = await process({ ...source, stage_info: stage }, { force: force || !!(Array.isArray(source.reports) ? source.reports.length : source.reports) });
      if (!result?.ok && result?.skipped !== 'already done') {
        failure = result?.skipped === 'transcript not ready' || result?.skipped === 'Recall bot unavailable' ? 'RECALL_TRANSCRIPT_PENDING' : 'RECALL_PROCESSING_UNAVAILABLE';
        if (failure === 'RECALL_TRANSCRIPT_PENDING') retryAfter = 60;
      }
    } catch { failure = 'RECALL_PROCESSING_UNAVAILABLE'; }
    try {
      const row = await current();
      if (row?.stage_info?.recallRecovery?.lease === lease) {
        // Artifact readiness checks do not spend the AI retry budget. A provider
        // can take several minutes to publish its transcript after the event.
        const finished = { botId: source.bot_id, attempts: failure === 'RECALL_TRANSCRIPT_PENDING' ? (previous.attempts || 0) : attempts, state: failure ? 'failed' : 'complete', finishedAt: new Date(now()).toISOString(),
          ...(failure ? { error: failure, retryAfter: new Date(now() + retryAfter * 1000).toISOString() } : {}) };
        await database(`${base}&${stageFilter(row.stage_info)}`, { method: 'PATCH', body: { stage_info: { ...row.stage_info, recallRecovery: finished } } });
      }
    } catch { /* A crashed request keeps its bounded lease; never release another worker's claim. */ }
    return failure ? { state: 'failed', error: failure, retryAfter } : { state: 'complete', ...result };
  };
}

export const recoverRecallMeeting = createRecallRecovery();
