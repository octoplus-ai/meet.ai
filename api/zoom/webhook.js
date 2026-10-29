import { randomUUID } from 'node:crypto';
import { sb } from '../lib/supa.js';
import { sha256, verifyZoomWebhook, zoomWebhookChallenge, zoomRawBody } from '../lib/zoom-security.js';
import { handleRtmsEvent } from '../lib/zoom-rtms.js';
export const config = { api: { bodyParser: false }, maxDuration: 30 };
const events = new Set(['meeting.rtms_started', 'meeting.rtms_stopped', 'app_deauthorized']);
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  let key, lease;
  try {
    const raw = await zoomRawBody(req);
    if (!verifyZoomWebhook(raw, req.headers)) return res.status(401).json({ error: 'invalid_signature' });
    let body; try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'invalid_json' }); }
    if (body.event === 'endpoint.url_validation') return res.status(200).json(zoomWebhookChallenge(body.payload?.plainToken));
    if (!events.has(body.event)) return res.status(200).json({ ignored: true });
    key = sha256(raw); lease = randomUUID();
    const claimed = await sb('rpc/zoom_claim_event', { method: 'POST', body: { p_key: key, p_lease: lease } });
    if (!claimed?.length) {
      const receipt = (await sb(`zoom_webhook_receipts?event_key=eq.${key}&select=completed_at&limit=1`))?.[0];
      if (receipt?.completed_at) return res.status(200).json({ duplicate: true });
      res.setHeader('Retry-After', '5'); return res.status(503).json({ error: 'event_processing' });
    }
    const result = await handleRtmsEvent(body);
    await sb(`zoom_webhook_receipts?event_key=eq.${key}&lease=eq.${lease}`, { method: 'PATCH', body: { completed_at: new Date().toISOString(), lease: null, lease_until: null } });
    return res.status(200).json(result);
  } catch (error) {
    if (key && lease) await sb(`zoom_webhook_receipts?event_key=eq.${key}&lease=eq.${lease}`, { method: 'PATCH', body: { lease: null, lease_until: null } }).catch(() => {});
    const safe = ['body_too_large', 'raw_body_required', 'invalid_challenge', 'invalid_rtms_event', 'zoom_capture_conflict'];
    return res.status(safe.includes(error.code) ? error.status : 503).json({ error: safe.includes(error.code) ? error.code : 'zoom_webhook_retry' });
  }
}
