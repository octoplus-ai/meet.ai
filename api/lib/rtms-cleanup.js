import { sb } from './supa.js';
import { rtmsService } from './zoom-rtms.js';

const enc = encodeURIComponent, ID = /^[a-f0-9-]{36}$/i;
const valid = value => { if (!ID.test(value || '')) throw Object.assign(new Error('invalid_deletion'), { status: 400 }); return value; };
export async function dispatchRtmsPurge(row, { service = rtmsService } = {}) {
  valid(row.user_id); valid(row.meeting_id); valid(row.session_id);
  if (!/^[a-f0-9]{64}$/.test(row.stream_key || '')) throw new Error('invalid_deletion');
  const body = await service(`/v1/sessions/${row.stream_key}/purge`, { userId: row.user_id, meetingId: row.meeting_id, sessionId: row.session_id });
  return body.ok === true && body.id === row.stream_key && body.sessionId === row.session_id && body.state === 'purged' && body.purged === true;
}
export async function processRtmsDeletion(row, { database = sb, dispatch = dispatchRtmsPurge } = {}) {
  let purged = false; try { purged = await dispatch(row); } catch { return false; }
  if (!purged) return false;
  // The RPC acknowledges only the exact queued session's physical purge.
  // The original authenticated delete routes retain ownership of DB deletion.
  return await database('rpc/zoom_ack_deletion', { method: 'POST', body: { p_user_id: row.user_id, p_meeting_id: row.meeting_id, p_session_id: row.session_id, p_stream_key: row.stream_key } }) === true;
}
export async function requestRtmsDeletion(userId, meetingId = null, { database = sb, dispatch = dispatchRtmsPurge } = {}) {
  valid(userId); if (meetingId) valid(meetingId);
  const begun = await database('rpc/zoom_begin_deletion', { method: 'POST', body: { p_user_id: userId, p_meeting_id: meetingId } });
  if (!begun?.ok) throw Object.assign(new Error('meeting_not_found'), { status: 404 });
  const filter = `user_id=eq.${enc(userId)}${meetingId ? `&meeting_id=eq.${enc(meetingId)}` : ''}`;
  const rows = await database(`zoom_rtms_deletions?${filter}&purged_at=is.null&select=*&order=requested_at.asc&limit=2`);
  for (const row of rows || []) await processRtmsDeletion(row, { database, dispatch });
  const pending = await database(`zoom_rtms_deletions?${filter}&purged_at=is.null&select=meeting_id&limit=1`);
  if (pending?.length) return { ok: true, pending: true, deletion: 'requested' };
  // Account deletion deliberately remains in its original authenticated route,
  // behind the user's email confirmation. This helper never deletes an account.
  return { ok: true, pending: false };
}
export async function sweepRtmsDeletions({ database = sb, dispatch = dispatchRtmsPurge, limit = 2 } = {}) {
  limit = Math.max(1, Math.min(5, Number(limit) || 2));
  const rows = await database(`zoom_rtms_deletions?purged_at=is.null&select=*&order=requested_at.asc&limit=${limit}`);
  let purged = 0;
  for (const row of rows || []) { try { if (await processRtmsDeletion(row, { database, dispatch })) purged++; } catch { /* Durable queue retries. */ } }
  return { inspected: rows?.length || 0, purged };
}
