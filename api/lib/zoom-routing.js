import { sb } from './supa.js';
import { recordingGate } from './plan.js';
import { getRtmsConnectionState } from './zoom.js';
import { controlRTMSMeeting } from './zoom-rtms.js';
import { parseMeetingUrl, meetingLimitMinutes } from '../../shared/meeting-platform.js';

// Enable only after the private Zoom schema and the RTMS service are installed.
// Once selected, an unavailable or revoked RTMS connection never falls back to a browser bot.
export async function resolveZoomCaptureRoute(userId, platform, { env = process.env, getState = getRtmsConnectionState } = {}) {
  if (platform !== 'zoom' || env.ZOOM_RTMS_ROUTING !== 'true') return { mode: 'browser' };
  try {
    const state = await getState(userId);
    if (!state.selected) return { mode: 'browser' };
    return { mode: 'rtms', ready: state.ready === true, error: state.ready ? null : state.connected ? 'zoom_rtms_not_ready' : 'zoom_not_connected' };
  } catch {
    return { mode: 'rtms', ready: false, error: 'zoom_configuration_unavailable' };
  }
}

export async function expireRtmsIntents(userId, { database = sb, now = Date.now(), env = process.env } = {}) {
  if (env.ZOOM_RTMS_ROUTING !== 'true') return [];
  return database('rpc/zoom_expire_intents', { method: 'POST', body: { p_user_id: userId, p_now: new Date(now).toISOString() } });
}
export async function scheduleRtmsMeeting(userId, options, route, { database = sb, gate = recordingGate, control = controlRTMSMeeting, now = Date.now() } = {}) {
  if (!route?.ready) return { error: route?.error || 'zoom_rtms_not_ready', status: 409, mode: 'zoom_rtms' };
  const { meetingUrl, title, joinAt, endAt, calendarEventId, manualRetry = false } = options;
  let parsed;
  try { parsed = parseMeetingUrl(meetingUrl); } catch { return { error: 'invalid_meeting_url', status: 400 }; }
  if (parsed.platform !== 'zoom' || !parsed.meetingId) return { error: 'zoom_meeting_id_required', status: 400 };
  let start = joinAt ? Date.parse(joinAt) : now, end = endAt ? Date.parse(endAt) : null;
  if (!Number.isFinite(start)) return { error: 'invalid_join_at', status: 400 };
  if (endAt && (!Number.isFinite(end) || end <= start)) return { error: 'invalid_end_at', status: 400 };
  if (!manualRetry && now >= (end || start + 120 * 60000) + 5 * 60000) return { error: 'meeting_not_armed', status: 409 };
  const retryAfterEnd = manualRetry && now >= (end || start + 120 * 60000) + 5 * 60000;
  if (retryAfterEnd) { start = now; end = null; }
  const enc = encodeURIComponent;
  const columns = 'id,user_id,status,status_synced_at,start_time,end_time,calendar_event_id,capture_mode,meeting_url,stage_info,error,recording_url';
  const rows = calendarEventId ? await database(`meetings?user_id=eq.${enc(userId)}&calendar_event_id=eq.${enc(calendarEventId)}&select=${columns}&limit=1`) : [];
  let existing = rows?.[0];
  if (existing?.stage_info?.deletion) return { error: 'meeting_not_armed', status: 409 };
  // Numeric Zoom identity is independent of vanity host, join path or opaque pwd token.
  const active = await database(`meetings?user_id=eq.${enc(userId)}&status=in.(scheduled,joining,in_call,recording,processing)&select=${columns}`);
  const sameZoom = row => {
    try { const value = parseMeetingUrl(row.meeting_url); return value.platform === 'zoom' && value.meetingId === parsed.meetingId; } catch { return false; }
  };
  const overlaps = row => {
    if (row.status !== 'scheduled' || row.stage_info?.rtmsSessionId) return true;
    const rowStart = Date.parse(row.start_time), rowEnd = Date.parse(row.end_time);
    return !Number.isFinite(rowStart) || rowStart <= (end || start + 120 * 60000) + 300000 && (rowEnd > rowStart ? rowEnd : rowStart + 120 * 60000) + 300000 >= start;
  };
  const requestStart = async result => {
    if (!manualRetry || !result.meeting || !['scheduled','joining'].includes(result.meeting.status) || result.meeting.stage_info?.rtmsSessionId) return result;
    if (result.meeting.stage_info?.manualIntent !== true) {
      const promoted = await database('rpc/zoom_mark_manual_intent', { method: 'POST', body: { p_user_id: userId, p_meeting_id: result.meeting.id, p_status: result.meeting.status, p_synced: result.meeting.status_synced_at || null } });
      if (!promoted?.length) return { error: 'meeting_not_armed', status: 409, mode: 'zoom_rtms', meeting_id: result.meeting.id };
      result = { ...result, meeting: promoted[0] };
    }
    if (start > now + 30000) return result;
    try { await control(userId, result.meeting.id, 'start'); return { ...result, startRequested: true }; }
    catch (error) { const allowed = ['zoom_not_connected','zoom_reconnect_required','zoom_refresh_pending','zoom_rate_limited','zoom_rtms_not_ready']; return { error: allowed.includes(error.code) ? error.code : 'zoom_rtms_control_failed', status: error.status >= 400 && error.status <= 599 ? error.status : 502, mode: 'zoom_rtms', meeting_id: result.meeting.id, awaitingAuthorization: true }; }
  };
  const conflicting = (active || []).find(row => row.id !== existing?.id && sameZoom(row) && overlaps(row));
  if (conflicting) {
    if (conflicting.stage_info?.deletion) return { error: 'meeting_not_armed', status: 409 };
    if (conflicting.capture_mode !== 'zoom_rtms') return { error: 'zoom_existing_capture', status: 409, meeting_id: conflicting.id };
    return requestStart({ already: true, meeting: conflicting, mode: 'zoom_rtms', awaitingAuthorization: ['scheduled', 'joining'].includes(conflicting.status) });
  }
  const moved = existing && (existing.meeting_url !== parsed.url || Math.abs(Date.parse(existing.start_time) - start) > 120000);
  const replace = existing && (existing.stage_info?.rtmsSessionId || existing.recording_url || existing.status === 'done') && (manualRetry || moved && start > now);
  if (existing && (['in_call','recording','processing'].includes(existing.status) || existing.status === 'done' && !replace)) return { already: true, meeting: existing, mode: existing.capture_mode, awaitingAuthorization: false };
  if (existing?.capture_mode !== 'zoom_rtms' && ['scheduled', 'joining'].includes(existing?.status)) return { error: 'zoom_existing_capture', status: 409, meeting_id: existing.id };
  if (existing?.status === 'skipped' && !manualRetry) return { error: 'meeting_not_armed', status: 409, meeting_id: existing.id };
  if (existing?.status === 'error' && !manualRetry && !moved) return { error: 'meeting_not_armed', status: 409, meeting_id: existing.id };
  const budget = await gate(userId);
  if (!budget.allow) return { error: 'recording_limit', limit: true, plan: budget.plan, usedMin: budget.usedMin, capMin: budget.capMin };
  const body = {
    title: title || 'Zoom meeting', source: 'Zoom', meeting_url: parsed.url,
    start_time: new Date(start).toISOString(), end_time: end ? new Date(end).toISOString() : null,
    status: 'scheduled', capture_mode: 'zoom_rtms', bot_id: null, error: null,
    status_synced_at: new Date(now).toISOString(),
    stage_info: { ...(replace ? { previousAttemptId: existing.id } : existing?.stage_info || {}), ...(retryAfterEnd ? { calendarStart: joinAt || null, calendarEnd: endAt || null } : {}), manualIntent: manualRetry || (!replace && existing?.stage_info?.manualIntent === true), platform: 'zoom', capture: 'rtms', awaitingAuthorization: true, maxMeetingMin: meetingLimitMinutes(budget.maxMeetingMin), zoomMeetingId: parsed.meetingId },
  };
  let saved;
  if (replace) {
    saved = await database('rpc/zoom_replace_intent', { method: 'POST', body: { p_user_id: userId, p_prior_id: existing.id, p_status: existing.status, p_synced: existing.status_synced_at || null, p_meeting: { ...body, calendar_event_id: calendarEventId || null } } });
  } else if (existing) {
    const compare = `meetings?id=eq.${enc(existing.id)}&user_id=eq.${enc(userId)}&status=eq.${enc(existing.status)}` +
      (existing.status_synced_at ? `&status_synced_at=eq.${enc(existing.status_synced_at)}` : '&status_synced_at=is.null');
    saved = await database(compare, { method: 'PATCH', prefer: 'return=representation', body });
  } else {
    try { saved = await database('rpc/zoom_create_intent', { method: 'POST', body: { p_user_id: userId, p_meeting: { ...body, calendar_event_id: calendarEventId || null } } }); }
    catch (error) { if (/23505|duplicate/i.test(String(error.message || ''))) return { error: 'meeting_not_armed', status: 409 }; throw error; }
  }
  if (!saved?.[0]) return { error: 'meeting_not_armed', status: 409 };
  // An armed row is intent only. Recording requires a signed Zoom event and real media.
  return requestStart({ ok: true, scheduled: true, meeting: saved[0], mode: 'zoom_rtms', awaitingAuthorization: true });
}
