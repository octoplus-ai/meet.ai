import { currentUser } from '../lib/session.js';
import { getZoomConnection, getRtmsConnectionState, rtmsConfigured } from '../lib/zoom.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const user = await currentUser(req); if (!user) return res.status(401).json({ error: 'not_authenticated' });
    const state = await getRtmsConnectionState(user.id), row = await getZoomConnection(user.id);
    const scopes = state.connected ? row.scopes.filter(value => typeof value === 'string') : [];
    res.status(200).json({ configured: state.configured, connected: state.connected, selected: state.selected, email: row?.email || null,
      account: row ? { email: row.email, connectedAt: row.connected_at } : null, scopes, rtmsConfigured: rtmsConfigured(),
      capabilities: { audio: scopes.includes('meeting:read:meeting_audio'), video: scopes.includes('meeting:read:meeting_video'), screenshare: scopes.includes('meeting:read:meeting_screenshare'), transcript: scopes.includes('meeting:read:meeting_transcript') },
      captureMode: 'native_rtms', meetingAccess: 'requires_zoom_permission' });
  } catch { res.status(500).json({ error: 'zoom_status_failed' }); }
}
