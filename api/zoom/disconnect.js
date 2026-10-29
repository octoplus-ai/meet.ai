import { currentUser } from '../lib/session.js';
import { requireZoomMutation } from '../lib/zoom-security.js';
import { disconnectRtmsUser } from '../lib/zoom-rtms.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    requireZoomMutation(req);
    const user = await currentUser(req); if (!user) return res.status(401).json({ error: 'not_authenticated' });
    await disconnectRtmsUser(user.id); return res.status(200).json({ ok: true, connected: false });
  } catch (error) { return res.status(error.code === 'invalid_origin' ? 403 : 503).json({ error: error.code === 'invalid_origin' ? error.code : 'zoom_disconnect_failed' }); }
}
