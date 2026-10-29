import { sb } from '../lib/supa.js';
import { authorizeRtmsCallback } from '../lib/zoom-rtms.js';
import { rtmsMedia, safeRtmsError } from '../lib/zoom-delivery.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { session } = await authorizeRtmsCallback(req, body);
    if (!['joining','recording','processing','error'].includes(body.status)) return res.status(400).json({ error: 'invalid_status' });
    const result = await sb('rpc/zoom_session_update', { method: 'POST', body: { p_session_id: session.id, p_status: body.status, p_error: body.status === 'error' ? safeRtmsError(body.error) : null, p_media: rtmsMedia(body, session) } });
    return res.status(result?.ok ? 200 : 409).json(result || { ok: false, stop: true });
  } catch (error) { const safe = ['unauthorized','zoom_capture_conflict','invalid_media','invalid_duration']; return res.status(safe.includes(error.code) ? error.status : 503).json({ error: safe.includes(error.code) ? error.code : 'zoom_status_retry', ...(['unauthorized','zoom_capture_conflict'].includes(error.code) ? { stop: true } : {}), ...(error.delete === true ? { delete: true } : {}) }); }
}
