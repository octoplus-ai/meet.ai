import { currentUser, parseCookies } from '../../lib/session.js';
import { claimZoomState, connectZoomAccount, zoomStateCookie } from '../../lib/zoom.js';
import { zoomRequestOrigin } from '../../lib/zoom-security.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Set-Cookie', zoomStateCookie());
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const redirect = code => { res.writeHead(302, { Location: code ? `/?zoom_error=${code}` : '/?zoom=connected' }); res.end(); };
  try {
    const user = await currentUser(req); if (!user) return redirect('not_authenticated');
    const params = new URL(req.url, 'https://local.invalid').searchParams, cookies = parseCookies(req);
    if (params.getAll('state').length !== 1 || params.getAll('code').length > 1 || params.getAll('error').length > 1) return redirect('invalid_state');
    const stateHash = await claimZoomState(params.get('state'), cookies.om_zoom_oauth, user.id, cookies.om_session, zoomRequestOrigin(req));
    if (params.get('error')) return redirect('access_denied');
    await connectZoomAccount(user.id, params.get('code'), stateHash); return redirect();
  } catch (error) { return redirect(['invalid_state', 'zoom_not_configured', 'zoom_missing_scopes'].includes(error.code) ? error.code : 'zoom_connect_failed'); }
}
