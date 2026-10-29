import { randomUUID } from 'node:crypto';
import { sb } from './supa.js';
import { recordingGate } from './plan.js';
import { parseMeetingUrl, meetingLimitMinutes } from '../../shared/meeting-platform.js';
import { rtmsConfigured, rtmsServiceConfigured, getRtmsConnectionState, revokeZoomConnection, controlZoomRtms } from './zoom.js';
import { appOrigin, encryptZoomSecret, decryptZoomSecret, randomSecret, sha256, secureEqual, safeRtmsServerUrls, zoomError } from './zoom-security.js';
const enc = encodeURIComponent;
export const rtmsStreamKey = (uuid, stream) => sha256(`${uuid}\0${stream}`);
const id = value => typeof value === 'string' && /^[A-Za-z0-9_+/=-]{1,128}$/.test(value);
export async function rtmsService(path, body) {
  if (!(path === '/v1/sessions' ? rtmsConfigured() : rtmsServiceConfigured())) throw zoomError('zoom_rtms_not_ready', 503);
  if (!/^\/v1\/(?:sessions(?:\/[a-f0-9]{64}\/(?:stop|purge))?|users\/[a-zA-Z0-9-]+\/revoke)$/.test(path)) throw zoomError('invalid_request', 400);
  let response;
  try { response = await fetch(`${process.env.ZOOM_RTMS_SERVICE_URL.replace(/\/$/, '')}${path}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${process.env.RTMS_SERVICE_SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw zoomError('zoom_rtms_dispatch_failed', 503); }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) throw zoomError('zoom_rtms_dispatch_failed', 503);
  return data;
}
export async function disconnectRtmsUser(userId, options = {}) {
  // Persist stop intent before making requests; worker heartbeat also receives stop:true.
  const revoked = await revokeZoomConnection(userId, { ...options, revokeProvider: !options.deauthorized,
    stopStreams: () => rtmsService(`/v1/users/${enc(userId)}/revoke`, { reason: options.deauthorized ? 'revoked' : 'user_requested' }) });
  if (!revoked && !options.deauthorized) throw zoomError('zoom_disconnect_changed', 409);
  return revoked;
}
export async function controlRTMSMeeting(userId, internalMeetingId, action) {
  if (!['start', 'stop'].includes(action) || !/^[a-f0-9-]{36}$/i.test(internalMeetingId || '')) throw zoomError('invalid_request', 400);
  if (action === 'stop') return stopRTMSMeeting(userId, internalMeetingId);
  const meeting = (await sb(`meetings?id=eq.${enc(internalMeetingId)}&user_id=eq.${enc(userId)}&capture_mode=eq.zoom_rtms&select=id,meeting_url,status,stage_info&limit=1`))?.[0];
  if (!meeting) throw zoomError('meeting_not_found', 404);
  if (['done', 'skipped'].includes(meeting.status) || meeting.stage_info?.deletion) throw zoomError('meeting_not_active', 409);
  if (!(await getRtmsConnectionState(userId)).ready) throw zoomError('zoom_rtms_not_ready', 409);
  const parsed = parseMeetingUrl(meeting.meeting_url);
  if (parsed.platform !== 'zoom' || !parsed.meetingId) throw zoomError('invalid_request', 400);
  await controlZoomRtms(userId, parsed.meetingId, action);
  return { ok: true, requested: action, awaitingZoomPermission: action === 'start' };
}
export async function stopRTMSMeeting(userId, meetingId) {
  const rows = await sb('rpc/zoom_stop_meeting', { method: 'POST', body: { p_user_id: userId, p_meeting_id: meetingId } });
  if (!rows?.length) throw zoomError('meeting_not_active', 409);
  // Durable intent is sufficient: the authenticated heartbeat closes capture if dispatch is down.
  let dispatched = true;
  for (const row of rows) try { await rtmsService(`/v1/sessions/${row.stream_key}/stop`, { reason: 'user_requested' }); } catch { dispatched = false; }
  return { ok: true, requested: 'stop', stopping: true, dispatched };
}
export async function disableRtmsMeeting(userId, meetingId) {
  const result = await sb('rpc/zoom_disable_meeting', { method: 'POST', body: { p_user_id: userId, p_meeting_id: meetingId } });
  if (!result?.ok) throw zoomError('meeting_not_found', 404);
  let dispatched = true;
  if (result.stream_key) try { await rtmsService(`/v1/sessions/${result.stream_key}/stop`, { reason: 'user_requested' }); } catch { dispatched = false; }
  return { ok: true, enabled: false, stopping: result.stopping === true, alreadyDone: result.alreadyDone === true, dispatched };
}
async function candidateMeeting(userId, meetingNumber, eventTs) {
  const from = new Date(eventTs - 4 * 3600000).toISOString(), to = new Date(eventTs + 5 * 60000).toISOString();
  const rows = await sb(`meetings?user_id=eq.${enc(userId)}&start_time=gte.${enc(from)}&start_time=lte.${enc(to)}&status=in.(scheduled,joining,in_call,recording,processing,error,skipped)&select=id,user_id,status,start_time,end_time,meeting_url,capture_mode&limit=100`);
  const matching = (rows || []).filter(row => {
    try {
      const parsed = parseMeetingUrl(row.meeting_url);
      const number = parsed.meetingId;
      const end = Date.parse(row.end_time), start = Date.parse(row.start_time);
      return parsed.platform === 'zoom' && number === meetingNumber && eventTs < (end > start ? end : start + 2 * 3600000) + 300000;
    } catch { return false; }
  });
  if (matching.some(row => row.status === 'skipped' || (row.capture_mode !== 'zoom_rtms' && row.status !== 'error'))) throw zoomError('zoom_capture_conflict', 409);
  const available = [];
  for (const row of matching) {
    if (row.capture_mode !== 'zoom_rtms') continue;
    const sessions = await sb(`zoom_rtms_sessions?meeting_id=eq.${enc(row.id)}&select=id,stop_requested,delivered_at&limit=1`);
    if (sessions?.length) { if (!sessions[0].stop_requested && !sessions[0].delivered_at) throw zoomError('zoom_capture_conflict', 409); }
    else available.push(row);
  }
  if (available.length > 1) throw zoomError('zoom_capture_conflict', 409);
  return available[0]?.id || null;
}
export async function handleRtmsEvent(body) {
  const p = body?.payload;
  if (!p || typeof p !== 'object') throw zoomError('invalid_rtms_event', 400);
  if (body.event === 'app_deauthorized') {
    if (p.client_id !== process.env.ZOOM_CLIENT_ID || !id(p.account_id) || !id(p.user_id)) throw zoomError('invalid_rtms_event', 400);
    const eventTs = body.event_ts || Date.parse(p.deauthorization_time);
    if (!Number.isFinite(eventTs) || eventTs > Date.now() + 300000) throw zoomError('invalid_rtms_event', 400);
    const rows = await sb(`zoom_connections?account_id=eq.${enc(p.account_id)}&zoom_user_id=eq.${enc(p.user_id)}&select=id,user_id,connected_at&limit=2`);
    if (rows?.length !== 1 || Date.parse(rows[0].connected_at) > eventTs) return { ignored: true };
    await disconnectRtmsUser(rows[0].user_id, { accountId: p.account_id, zoomUserId: p.user_id, connectionId: rows[0].id, deauthorized: true }); return { ok: true };
  }
  if (!id(p.meeting_uuid) || !id(p.rtms_stream_id) || !Number.isSafeInteger(body.event_ts) || body.event_ts <= 0 || body.event_ts > Date.now() + 300000) throw zoomError('invalid_rtms_event', 400);
  const key = rtmsStreamKey(p.meeting_uuid, p.rtms_stream_id);
  if (body.event === 'meeting.rtms_stopped') {
    const rows = await sb('rpc/zoom_stop_stream', { method: 'POST', body: { p_key: key, p_event_ts: body.event_ts } });
    const session = rows?.[0];
    if (!session || body.event_ts < session.event_ts) return { ignored: true };
    await rtmsService(`/v1/sessions/${key}/stop`, { reason: 'stopped' }); return { ok: true };
  }
  if (body.event !== 'meeting.rtms_started') return { ignored: true };
  if (!id(p.account_id) || !id(p.operator_id) || !/^\d{9,12}$/.test(String(p.meeting_id)) || body.event_ts < Date.now() - 15 * 60000) throw zoomError('invalid_rtms_event', 400);
  const serverUrls = safeRtmsServerUrls(p.server_urls);
  const connections = await sb(`zoom_connections?account_id=eq.${enc(p.account_id)}&zoom_user_id=eq.${enc(p.operator_id)}&revoked_at=is.null&select=user_id,id&limit=2`);
  if (connections?.length !== 1) return { ignored: true };
  const connection = connections[0], state = await getRtmsConnectionState(connection.user_id);
  if (!state.ready) return { ignored: true };
  const stops = await sb(`zoom_rtms_stops?stream_key=eq.${key}&select=stream_key&limit=1`);
  if (stops?.length) return { ignored: true };
  const existing = (await sb(`zoom_rtms_sessions?stream_key=eq.${key}&select=*&limit=1`))?.[0];
  let session = existing;
  if (!session) {
    const gate = await recordingGate(connection.user_id);
    if (!gate.allow) return { ignored: true };
    const sid = randomUUID(), callbackToken = randomSecret();
    const meetingId = await candidateMeeting(connection.user_id, String(p.meeting_id), body.event_ts);
    const opened = await sb('rpc/zoom_open_rtms_session', { method: 'POST', body: { p_meeting_id: meetingId, p_session: {
      id: sid, stream_key: key, user_id: connection.user_id, connection_id: connection.id, account_id: p.account_id, operator_id: p.operator_id,
      meeting_uuid: p.meeting_uuid, zoom_meeting_id: String(p.meeting_id), stream_id: p.rtms_stream_id, event_ts: body.event_ts,
      callback_hash: sha256(callbackToken), callback_ciphertext: encryptZoomSecret(callbackToken, `rtms:${connection.user_id}:${sid}`),
      callback_expires_at: new Date(Date.now() + 6 * 3600000).toISOString(), max_meeting_min: meetingLimitMinutes(gate.maxMeetingMin),
    } } });
    if (opened?.length !== 1) return { ignored: true }; session = opened[0];
  }
  if (session.user_id !== connection.user_id || session.account_id !== p.account_id || session.operator_id !== p.operator_id || session.connection_id !== connection.id) throw zoomError('zoom_capture_conflict', 409);
  if (session.stop_requested || session.delivered_at || Date.parse(session.callback_expires_at) <= Date.now() || Date.parse(session.capture_deadline_at) <= Date.now()) return { ignored: true };
  const callbackToken = decryptZoomSecret(session.callback_ciphertext, `rtms:${session.user_id}:${session.id}`);
  const result = await rtmsService('/v1/sessions', { sessionId: session.id, meetingId: session.meeting_id, userId: session.user_id,
    meetingUuid: p.meeting_uuid, streamId: p.rtms_stream_id, serverUrls, operatorId: p.operator_id,
    startedAt: new Date(session.event_ts).toISOString(), eventTimestamp: session.event_ts, maxMeetingMin: session.max_meeting_min, captureDeadlineAt: new Date(session.capture_deadline_at).toISOString(),
    callbackUrl: `${appOrigin()}/api/zoom/rtms-ingest`, statusUrl: `${appOrigin()}/api/zoom/rtms-status`, callbackToken });
  if (result.id !== key || !['queued', 'running', 'stopping', 'stopped', 'done'].includes(result.state)) throw zoomError('zoom_rtms_dispatch_failed', 503);
  return { ok: true };
}
export async function authorizeRtmsCallback(req, body) {
  const bearer = req.headers.authorization;
  if (typeof bearer !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer) || typeof body?.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.sessionId)) throw zoomError('unauthorized', 401);
  const session = (await sb(`zoom_rtms_sessions?id=eq.${enc(body.sessionId)}&select=*&limit=1`))?.[0];
  if (!session || !secureEqual(session.callback_hash, sha256(bearer.slice(7))) || Date.parse(session.callback_expires_at) <= Date.now() ||
      (body.meetingId && body.meetingId !== session.meeting_id) || (body.userId && body.userId !== session.user_id)) throw zoomError('unauthorized', 401);
  const meeting = (await sb(`meetings?id=eq.${enc(session.meeting_id)}&user_id=eq.${enc(session.user_id)}&capture_mode=eq.zoom_rtms&select=*&limit=1`))?.[0];
  if (!meeting || meeting.stage_info?.rtmsSessionId !== session.id) throw zoomError('zoom_capture_conflict', 409);
  if (meeting.stage_info?.deletion) throw Object.assign(zoomError('zoom_capture_conflict', 409), { delete: true });
  return { session, meeting };
}
