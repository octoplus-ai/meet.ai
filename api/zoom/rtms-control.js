import { currentUser } from '../lib/session.js';
import { requireZoomMutation } from '../lib/zoom-security.js';
import { controlRTMSMeeting } from '../lib/zoom-rtms.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    requireZoomMutation(req);
    const user = await currentUser(req); if (!user) return res.status(401).json({ error: 'not_authenticated' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!['start', 'stop'].includes(body?.action) || !/^[a-f0-9-]{36}$/i.test(body?.meetingId || '')) return res.status(400).json({ error: 'invalid_request' });
    return res.status(202).json(await controlRTMSMeeting(user.id, body.meetingId, body.action));
  } catch (error) { const safe = ['invalid_origin', 'invalid_request', 'meeting_not_found', 'meeting_not_active', 'zoom_rtms_not_ready', 'zoom_not_connected', 'zoom_reconnect_required', 'zoom_refresh_pending', 'zoom_rate_limited', 'zoom_rtms_control_failed']; return res.status(safe.includes(error.code) ? error.status : 502).json({ error: safe.includes(error.code) ? error.code : 'zoom_rtms_control_failed' }); }
}
