import { randomUUID } from 'node:crypto';
import { sb } from './lib/supa.js';
import { REPORT_LANGUAGES, reportTranslationSource, translationMeeting, translateReport, translationError } from './lib/report-translation.js';

export const config = { maxDuration: 300 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeErrors = new Set(['invalid_request','unsupported_language','not_authorized','report_not_ready','report_too_large','translation_unavailable','translation_timeout','translation_busy','translation_failed','translation_invalid','translation_incomplete','translation_limit','report_changed']);

export function createTranslationHandler({ database = sb, authorize = translationMeeting, generate = translateReport } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST only' }); }
    let claim, lease, meeting, source, body;
    try {
      if (Number(req.headers?.['content-length']) > 4096 || (typeof req.body === 'string' && req.body.length > 4096)) throw translationError('invalid_request', 400);
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { throw translationError('invalid_request', 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || !uuid.test(body.meetingId || '') || Object.keys(body).some(key => !['meetingId','shareToken','lang'].includes(key))) throw translationError('invalid_request', 400);
      if (!Object.hasOwn(REPORT_LANGUAGES, body.lang || '')) throw translationError('unsupported_language', 400);
      if (body.shareToken != null && (typeof body.shareToken !== 'string' || !/^[a-z0-9_-]{16,256}$/i.test(body.shareToken))) throw translationError('invalid_request', 400);
      meeting = await authorize(req, body);
      if (!meeting) throw translationError('not_authorized', 403);
      source = reportTranslationSource(meeting);
      lease = randomUUID();
      claim = await database('rpc/claim_report_translation', { method: 'POST', body: { p_meeting_id: meeting.id, p_user_id: meeting.user_id, p_source_hash: source.sourceHash, p_lang: body.lang, p_lease: lease } });
      if (claim?.state === 'ready') return res.status(200).json({ lang: body.lang, sourceHash: source.sourceHash, cached: true, translation: claim.payload });
      if (claim?.state === 'pending') { res.setHeader('Retry-After', '5'); return res.status(202).json({ pending: true, lang: body.lang, sourceHash: source.sourceHash }); }
      if (claim?.state !== 'claimed') throw translationError(claim?.state === 'limit' ? 'translation_limit' : 'translation_unavailable', claim?.state === 'limit' ? 429 : 503);
      const translation = await generate(source, body.lang);
      const fresh = await authorize(req, body);
      if (!fresh) throw translationError('not_authorized', 403);
      if (reportTranslationSource(fresh).sourceHash !== source.sourceHash) throw translationError('report_changed', 409);
      const saved = await database('rpc/finish_report_translation', { method: 'POST', body: { p_meeting_id: meeting.id, p_source_hash: source.sourceHash, p_lang: body.lang, p_lease: lease, p_payload: translation } });
      if (saved !== true) throw translationError('translation_unavailable', 503);
      return res.status(200).json({ lang: body.lang, sourceHash: source.sourceHash, cached: false, translation });
    } catch (failure) {
      if (claim?.state === 'claimed') {
        try { await database('rpc/finish_report_translation', { method: 'POST', body: { p_meeting_id: meeting.id, p_source_hash: source.sourceHash, p_lang: body.lang, p_lease: lease, p_payload: null } }); } catch { /* Lease expiry permits recovery; never log private provider/database bodies. */ }
      }
      const code = safeErrors.has(failure?.code) ? failure.code : failure?.name === 'TimeoutError' ? 'translation_timeout' : 'translation_unavailable';
      const status = safeErrors.has(failure?.code) ? failure.status || 502 : code === 'translation_timeout' ? 504 : 503;
      if (status === 429) res.setHeader('Retry-After', '60');
      return res.status(status).json({ error: code });
    }
  };
}

export default createTranslationHandler();
