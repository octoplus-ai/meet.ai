import { currentUser, parseCookies } from '../../lib/session.js';
import { createZoomAuthorization, zoomStateCookie } from '../../lib/zoom.js';
import { zoomRequestOrigin } from '../../lib/zoom-security.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'invalid_origin' });
    const user = await currentUser(req); if (!user) return res.status(401).json({ error: 'not_authenticated' });
    const auth = await createZoomAuthorization(user.id, parseCookies(req).om_session, zoomRequestOrigin(req));
    res.setHeader('Set-Cookie', zoomStateCookie(auth.nonce)); res.writeHead(302, { Location: auth.url }); res.end();
  } catch (error) { return res.status(error.code === 'zoom_not_configured' ? 503 : 500).json({ error: error.code === 'zoom_not_configured' ? error.code : 'zoom_connect_failed' }); }
}
