import { randomUUID } from 'node:crypto';
import { sb } from './supa.js';
import { getValidToken } from './google.js';
import { randomToken } from './session.js';
import { getBotSender, sendViaGmail, reportEmail } from './email.js';
import { deliverReport } from './deliver.js';
import { partialCaptureSummary } from './capture-integrity.js';

const APP_URL = 'https://meet.octoplusteam.com/';
const list = value => Array.isArray(value) ? value : [];
const emailPattern = /^[^\s,<>"@]+@[^\s,<>"@]+\.[^\s,<>"@]+$/;
const enc = encodeURIComponent;

export function recapCoverUrl(meeting, shareToken) {
  if (meeting.capture_mode === 'zoom_rtms') return '';
  return meeting.cover_url || (meeting.bot_id && meeting.capture_mode !== 'inhouse_bot'
    ? APP_URL + 'api/recall/thumb?botId=' + enc(meeting.bot_id) + '&share=' + enc(shareToken) : '');
}

// No credentials or report bodies enter the delivery ledger. A lease protects each recipient;
// confirmed sends stay sent, explicit provider rejections retry, and ambiguous sends need review.
export function createMeetingNotifier({ database = sb, ownerToken = getValidToken, botSender = getBotSender,
  send = sendViaGmail, push = deliverReport, render = reportEmail, request = fetch,
  token = randomToken, uuid = randomUUID, now = Date.now, logger = console } = {}) {
  const finish = (job, lease, status, error = null, providerId = null) => database('rpc/finish_meeting_notification', {
    method: 'POST', body: { p_id: job.id, p_lease: lease, p_status: status, p_error: error, p_provider_id: providerId },
  });
  const available = (meeting, job) => meeting && meeting.user_id === job.user_id && meeting.status === 'done'
    && (meeting.capture_mode !== 'zoom_rtms' || (!meeting.stage_info?.deletion && meeting.stage_info?.rtmsSessionId === job.capture_session_id));

  async function deliver(job, { deadline = now() + 35000 } = {}) {
    const remaining = max => Math.max(1, Math.min(max, deadline - now()));
    const lease = uuid();
    const claimed = (await database('rpc/claim_meeting_notification', { method: 'POST', body: { p_id: job.id, p_lease: lease } }))?.[0];
    if (!claimed) return 'skipped';
    let attempted = false;
    try {
      const meeting = (await database(`meetings?id=eq.${enc(job.meeting_id)}&user_id=eq.${enc(job.user_id)}&select=*,reports(*)&limit=1`))?.[0];
      if (!available(meeting, claimed)) { await finish(job, lease, 'cancelled', 'meeting_unavailable'); return 'cancelled'; }
      const report = Array.isArray(meeting.reports) ? meeting.reports[0] : meeting.reports;
      if (!report?.summary?.trim() || report.user_id !== claimed.user_id) { await finish(job, lease, 'retry', 'report_unavailable'); return 'retry'; }
      const summary = partialCaptureSummary(report.summary, meeting.stage_info);
      const owner = (await database(`app_users?id=eq.${enc(job.user_id)}&select=name,email,sharing_prefs,integrations`))?.[0];
      if (!owner?.email) { await finish(job, lease, 'retry', 'owner_unavailable'); return 'retry'; }
      const stillAvailable = async () => available((await database(`meetings?id=eq.${enc(job.meeting_id)}&user_id=eq.${enc(job.user_id)}&select=id,user_id,status,capture_mode,stage_info&limit=1`))?.[0], claimed);
      let result;
      if (claimed.kind === 'push') {
        const cfg = owner.integrations?.[claimed.recipient];
        if (!cfg?.autoPush || !(cfg.url || cfg.token)) { await finish(job, lease, 'cancelled', 'push_disabled'); return 'cancelled'; }
        if (!(await stillAvailable())) { await finish(job, lease, 'cancelled', 'meeting_unavailable'); return 'cancelled'; }
        if (now() >= deadline) { await finish(job, lease, 'retry', 'time_budget'); return 'retry'; }
        attempted = true;
        result = await push(claimed.recipient, cfg, { title: meeting.title || 'Meeting report', summary,
          score: report.scores?.overall || 0, actionItems: report.action_items || [], nextSteps: report.next_steps || [], date: meeting.start_time, link: APP_URL }, { timeoutMs: remaining(10000) });
      } else {
        if (owner.sharing_prefs?.autoRecap === false && claimed.recipient !== owner.email.toLowerCase()) {
          await finish(job, lease, 'cancelled', 'participant_recap_disabled'); return 'cancelled';
        }
        const share = list(meeting.shares).find(entry => entry.token === claimed.share_token && entry.email?.toLowerCase() === claimed.recipient);
        if (!share) { await finish(job, lease, 'cancelled', 'share_revoked'); return 'cancelled'; }
        const [bot, ownToken] = await Promise.all([botSender({ timeoutMs: remaining(8000) }).catch(() => null), ownerToken(job.user_id, { timeoutMs: remaining(8000) }).catch(() => null)]);
        const accessToken = bot?.token || ownToken;
        if (!accessToken) { await finish(job, lease, 'retry', 'no_sender'); return 'retry'; }
        let whenText = '';
        if (meeting.start_time) whenText = new Date(meeting.start_time).toLocaleString('en-US', { month: 'long', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const sharer = owner.name || owner.email;
        const content = render({ title: meeting.title || 'Meeting report', whenText, summary,
          chapters: report.chapters || [], actionItems: report.action_items || [], viewUrl: APP_URL + '?share=' + enc(claimed.share_token),
          coverUrl: recapCoverUrl(meeting, claimed.share_token), sharerName: sharer, kind: 'auto' });
        if (!(await stillAvailable())) { await finish(job, lease, 'cancelled', 'meeting_unavailable'); return 'cancelled'; }
        const message = { ...content, to: claimed.recipient, fromName: `${sharer} via OctoMeet AI`, replyTo: owner.email };
        if (now() >= deadline) { await finish(job, lease, 'retry', 'time_budget'); return 'retry'; }
        attempted = true;
        result = await send(accessToken, { ...message, fromAddress: bot?.fromAddress || owner.email }, { timeoutMs: remaining(15000) });
        // Only retry a different sender after an explicit authentication rejection: network
        // errors may happen after Gmail accepted the message and must never cause a duplicate.
        if (!result.ok && result.error === 'needScope' && bot?.token && ownToken && ownToken !== bot.token && now() < deadline) {
          if (!(await stillAvailable())) { await finish(job, lease, 'cancelled', 'meeting_unavailable'); return 'cancelled'; }
          result = await send(ownToken, { ...message, fromAddress: owner.email }, { timeoutMs: remaining(15000) });
        }
      }
      const status = result.ok ? 'sent' : result.uncertain || !result.status ? 'uncertain' : 'retry';
      await finish(job, lease, status, result.ok ? null : result.error || 'delivery_failed', result.id || null);
      logger.log('[recap]', job.id, status);
      return status;
    } catch {
      // A persistence failure after sending is also uncertain. Keep the record for review,
      // rather than clearing a global lock and mailing every successful recipient again.
      const status = attempted ? 'uncertain' : 'retry';
      await finish(job, lease, status, attempted ? 'delivery_outcome_unknown' : 'delivery_preparation_failed').catch(() => {});
      logger.error('[recap]', job.id, status);
      return status;
    }
  }

  async function drain({ jobs, limit = 2, budgetMs = 20000 } = {}) {
    const started = now(), results = [];
    const pending = jobs || await database(`meeting_notification_deliveries?status=in.(pending,retry,sending)&next_attempt_at=lte.${enc(new Date(now()).toISOString())}&order=next_attempt_at.asc,created_at.asc&limit=${Math.max(1, Math.min(limit, 20))}`);
    for (const job of list(pending).slice(0, Math.max(1, Math.min(limit, 100)))) {
      if (now() - started >= budgetMs) break;
      results.push(await deliver(job, { deadline: started + budgetMs }));
    }
    return results;
  }

  async function notify(meeting) {
    try {
      // Read the persisted report and permissions, never trust an old callback's metadata.
      const current = (await database(`meetings?id=eq.${enc(meeting.id)}&user_id=eq.${enc(meeting.user_id)}&select=*&limit=1`))?.[0];
      if (!current || current.status !== 'done' || (current.capture_mode === 'zoom_rtms' && (current.stage_info?.deletion || !current.stage_info?.rtmsSessionId))) return { skipped: true };
      const owner = (await database(`app_users?id=eq.${enc(current.user_id)}&select=email,sharing_prefs,integrations`))?.[0];
      if (!owner?.email) return { skipped: true };
      const recipients = new Set([owner.email.toLowerCase()]);
      if (owner.sharing_prefs?.autoRecap !== false) {
        let attendees = list(current.attendees);
        if (current.calendar_event_id) {
          const googleToken = await ownerToken(current.user_id).catch(() => null);
          if (googleToken) {
            try {
              const response = await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${enc(current.calendar_event_id)}`, { headers: { Authorization: `Bearer ${googleToken}` }, signal: AbortSignal.timeout(8000) });
              if (response.ok) { const event = await response.json(); attendees = list(event.attendees); }
            } catch { /* Stored invitees still work when Google refresh/calendar is unavailable. */ }
          }
        }
        for (const attendee of attendees) if (attendee?.email && !attendee.resource && (attendee.responseStatus || attendee.response) !== 'declined') recipients.add(attendee.email.toLowerCase());
      }
      const targets = [...recipients].filter(value => emailPattern.test(value)).slice(0, 180).map(recipient => ({ kind: 'email', recipient, token: token(), magic: token() }));
      for (const [recipient, cfg] of Object.entries(owner.integrations || {}).slice(0, 20)) if (cfg?.autoPush && (cfg.url || cfg.token)) targets.push({ kind: 'push', recipient });
      const jobs = await database('rpc/enqueue_meeting_notifications', { method: 'POST', body: { p_meeting_id: current.id, p_user_id: current.user_id, p_targets: targets } });
      // Owner first. Other recipients are durable even if the current function's budget ends.
      const ordered = list(jobs).sort((a, b) => Number(b.recipient === owner.email.toLowerCase()) - Number(a.recipient === owner.email.toLowerCase()));
      return { queued: ordered.length, results: await drain({ jobs: ordered, limit: 100, budgetMs: 35000 }) };
    } catch {
      logger.error('[recap] queue preparation failed for', meeting.id);
      return { error: 'notification_queue_unavailable' };
    }
  }
  return { notify, drain, deliver };
}

const notifier = createMeetingNotifier();
export const notifyMeetingParticipants = notifier.notify;
export const drainMeetingNotifications = notifier.drain;
