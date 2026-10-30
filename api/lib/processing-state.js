// Legacy Recall rows have no capture_mode. Never send native worker/RTMS ids to Recall.
export const usesRecall = meeting => !!meeting?.bot_id && (!meeting.capture_mode || meeting.capture_mode === 'recall');

export function hasCompleteReport(meeting) {
  const report = Array.isArray(meeting?.reports) ? meeting.reports[0] : meeting?.reports;
  return typeof report?.summary === 'string' && !!report.summary.trim()
    && typeof report?.transcript === 'string' && !!report.transcript.trim();
}

// A conditional write must not overwrite a heartbeat, callback, cancellation or
// finished report that arrived after the listing was read.
export function meetingStateFilter(meeting) {
  const enc = encodeURIComponent;
  return `meetings?id=eq.${enc(meeting.id)}&user_id=eq.${enc(meeting.user_id)}&status=eq.${enc(meeting.status)}`
    + (meeting.status_synced_at ? `&status_synced_at=eq.${enc(meeting.status_synced_at)}` : '&status_synced_at=is.null');
}

export function stalledNativeProcessing(meeting, now = Date.now()) {
  if (meeting?.capture_mode !== 'inhouse_bot' || meeting.status !== 'processing' || hasCompleteReport(meeting)) return false;
  const last = Date.parse(meeting.status_synced_at || meeting.created_at || '');
  return Number.isFinite(last) && now - last > 24 * 60 * 60000;
}
