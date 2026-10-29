// User-managed Zoom OAuth. Tokens never enter app_users, browser responses or worker payloads.
import { randomUUID } from 'node:crypto';
import { sb } from './supa.js';
import { appOrigin, zoomAppOrigins, zoomRedirectUri, tokenKey, encryptZoomSecret, decryptZoomSecret, randomSecret, sha256, zoomError } from './zoom-security.js';
export { zoomStateCookie } from './zoom-security.js';

export const ZOOM_SCOPES = ['user:read:user', 'meeting:read:meeting_audio', 'meeting:read:meeting_video', 'meeting:read:meeting_screenshare', 'meeting:update:participant_rtms_app_status'];
const enc = encodeURIComponent;
export function zoomConfigured(env = process.env) {
  try {
    tokenKey(env);
    const origins = zoomAppOrigins(env);
    return !!env.ZOOM_CLIENT_ID && !!env.ZOOM_CLIENT_SECRET && (!env.ZOOM_REDIRECT_URI || origins.some(origin => env.ZOOM_REDIRECT_URI === `${origin}/api/auth/zoom/callback`));
  } catch { return false; }
}
export function rtmsServiceConfigured(env = process.env) {
  try {
    const url = new URL(env.ZOOM_RTMS_SERVICE_URL);
    return (env.RTMS_SERVICE_SECRET?.length >= 32) && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && ['/', ''].includes(url.pathname);
  } catch { return false; }
}
export const rtmsConfigured = (env = process.env) => zoomConfigured(env) && env.ZOOM_RTMS_ENABLED === 'true' && !!env.ZOOM_WEBHOOK_SECRET_TOKEN && rtmsServiceConfigured(env);
export async function createZoomAuthorization(userId, sessionToken, origin = appOrigin()) {
  if (!zoomConfigured()) throw zoomError('zoom_not_configured', 503);
  if (!userId || !sessionToken) throw zoomError('not_authenticated', 401);
  if ((await sb(`zoom_rtms_account_deletions?user_id=eq.${enc(userId)}&select=user_id&limit=1`))?.length) throw zoomError('zoom_not_connected', 409);
  const state = randomSecret(), nonce = randomSecret();
  const redirectUri = zoomRedirectUri(origin);
  await sb('zoom_oauth_states', { method: 'POST', body: { state_hash: sha256(state), user_id: userId, session_hash: sha256(sessionToken), nonce_hash: sha256(nonce), redirect_uri: redirectUri, expires_at: new Date(Date.now() + 600000).toISOString() } });
  const params = new URLSearchParams({ response_type: 'code', client_id: process.env.ZOOM_CLIENT_ID, redirect_uri: redirectUri, state });
  return { url: `https://zoom.us/oauth/authorize?${params}`, nonce };
}
export async function claimZoomState(state, nonce, userId, sessionToken, origin = appOrigin()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state || '') || !/^[A-Za-z0-9_-]{43}$/.test(nonce || '') || !userId || !sessionToken) throw zoomError('invalid_state', 400);
  const stateHash = sha256(state);
  const rows = await sb(`zoom_oauth_states?state_hash=eq.${stateHash}&user_id=eq.${enc(userId)}&session_hash=eq.${sha256(sessionToken)}&nonce_hash=eq.${sha256(nonce)}&redirect_uri=eq.${enc(zoomRedirectUri(origin))}&expires_at=gt.${enc(new Date().toISOString())}&claimed_at=is.null&invalidated=eq.false`, {
    method: 'PATCH', prefer: 'return=representation', body: { claimed_at: new Date().toISOString() },
  });
  if (rows?.length !== 1) throw zoomError('invalid_state', 400);
  return stateHash;
}
async function zoomFetch(url, options, code = 'zoom_api_failed') {
  let res;
  try { res = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) }); }
  catch { throw zoomError(code); }
  if (!res.ok) throw zoomError(res.status === 429 ? 'zoom_rate_limited' : [400, 401].includes(res.status) && code === 'zoom_reconnect_required' ? 'zoom_reconnect_required' : code, res.status === 429 ? 429 : code === 'zoom_reconnect_required' && [400, 401].includes(res.status) ? 409 : 502);
  if (res.status === 204) return {};
  try { return await res.json(); } catch { throw zoomError(code); }
}
async function tokenRequest(fields) {
  if (!zoomConfigured()) throw zoomError('zoom_not_configured', 503);
  const token = await zoomFetch('https://zoom.us/oauth/token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }, fields.grant_type === 'refresh_token' ? 'zoom_reconnect_required' : 'zoom_connect_failed');
  if (!token?.access_token || !token?.refresh_token || typeof token.access_token !== 'string' || typeof token.refresh_token !== 'string' || String(token.token_type).toLowerCase() !== 'bearer' || !Number.isFinite(token.expires_in) || token.expires_in <= 0 || token.expires_in > 86400) throw zoomError('zoom_connect_failed');
  const scopes = typeof token.scope === 'string' ? token.scope.split(/\s+/) : [];
  if (!ZOOM_SCOPES.every(scope => scopes.includes(scope))) throw zoomError('zoom_missing_scopes', 409);
  return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(), scopes };
}
async function tokenIdentity(accessToken) {
  const value = await zoomFetch('https://api.zoom.us/v2/users/me', { headers: { Authorization: `Bearer ${accessToken}` } }, 'zoom_connect_failed');
  if (![value.id, value.account_id].every(x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x))) throw zoomError('zoom_connect_failed');
  return { zoom_user_id: value.id, account_id: value.account_id, email: typeof value.email === 'string' ? value.email.slice(0, 320).trim().toLowerCase() : null };
}
export async function connectZoomAccount(userId, code, stateHash) {
  if (typeof code !== 'string' || !code || code.length > 4096) throw zoomError('zoom_connect_failed');
  const claimed = (await sb(`zoom_oauth_states?state_hash=eq.${enc(stateHash)}&user_id=eq.${enc(userId)}&invalidated=eq.false&expires_at=gt.${enc(new Date().toISOString())}&select=redirect_uri,claimed_at&limit=1`))?.[0];
  if (!claimed?.claimed_at || !zoomAppOrigins().some(origin => claimed.redirect_uri === zoomRedirectUri(origin))) throw zoomError('invalid_state', 400);
  const token = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: claimed.redirect_uri });
  const identity = await tokenIdentity(token.accessToken), id = randomUUID();
  const rows = await sb('rpc/zoom_commit_connection', { method: 'POST', body: { p_state_hash: stateHash, p_user_id: userId, p_id: id, p_identity: identity, p_secret: encryptZoomSecret(token, `${userId}:${id}`), p_expiry: token.expiresAt, p_scopes: token.scopes } });
  if (!rows?.length) throw zoomError('invalid_state', 400);
  return rows[0];
}
export async function getZoomConnection(userId) {
  return (await sb(`zoom_connections?user_id=eq.${enc(userId)}&revoked_at=is.null&select=id,user_id,zoom_user_id,account_id,email,connected_at,selected,scopes,needs_reconnect,expires_at&limit=1`))?.[0] || null;
}
export async function getRtmsConnectionState(userId) {
  const configured = zoomConfigured();
  const row = (await sb(`zoom_connections?user_id=eq.${enc(userId)}&select=id,user_id,zoom_user_id,account_id,selected,scopes,needs_reconnect,revoked_at&limit=1`))?.[0];
  const connected = configured && !!row && !row.revoked_at && !row.needs_reconnect && ZOOM_SCOPES.every(scope => row.scopes?.includes(scope));
  return { configured, connected, selected: row?.selected === true, ready: connected && row.selected === true && rtmsConfigured(), connectionId: row?.id || null, zoomUserId: row?.zoom_user_id || null, accountId: row?.account_id || null };
}
export async function getZoomAccessToken(userId) {
  const row = (await sb(`zoom_connections?user_id=eq.${enc(userId)}&revoked_at=is.null&select=*&limit=1`))?.[0];
  if (!row || row.needs_reconnect) throw zoomError('zoom_not_connected', 409);
  const binding = `${userId}:${row.id}`, old = decryptZoomSecret(row.token_ciphertext, binding);
  if (Date.parse(row.expires_at) > Date.now() + 60000) return old.accessToken;
  const lease = randomUUID();
  const claimed = await sb('rpc/zoom_claim_refresh', { method: 'POST', body: { p_user_id: userId, p_id: row.id, p_lease: lease } });
  if (!claimed?.length) throw zoomError('zoom_refresh_pending', 503);
  try {
    const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: old.refreshToken });
    const owner = await tokenIdentity(fresh.accessToken);
    if (owner.zoom_user_id !== row.zoom_user_id || owner.account_id !== row.account_id) throw zoomError('zoom_reconnect_required', 409);
    const updated = await sb(`zoom_connections?id=eq.${enc(row.id)}&user_id=eq.${enc(userId)}&refresh_lease=eq.${enc(lease)}&revoked_at=is.null`, { method: 'PATCH', prefer: 'return=representation', body: { token_ciphertext: encryptZoomSecret(fresh, binding), expires_at: fresh.expiresAt, scopes: fresh.scopes, refresh_lease: null, refresh_lease_until: null } });
    if (!updated?.length) throw zoomError('zoom_reconnect_required', 409);
    return fresh.accessToken;
  } catch (error) {
    await sb(`zoom_connections?id=eq.${enc(row.id)}&refresh_lease=eq.${enc(lease)}&revoked_at=is.null`, { method: 'PATCH', body: { refresh_lease: null, refresh_lease_until: null, ...(error.code === 'zoom_reconnect_required' ? { needs_reconnect: true } : {}) } }).catch(() => {});
    throw error;
  }
}
export async function controlZoomRtms(userId, meetingId, action) {
  if (!/^\d{9,12}$/.test(String(meetingId)) || !['start', 'stop'].includes(action)) throw zoomError('invalid_request', 400);
  const token = await getZoomAccessToken(userId);
  return zoomFetch(`https://api.zoom.us/v2/live_meetings/${meetingId}/rtms_app/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, settings: { client_id: process.env.ZOOM_CLIENT_ID } }) }, 'zoom_rtms_control_failed');
}
export async function revokeZoomConnection(userId, { accountId, zoomUserId, connectionId, revokeProvider = true, stopStreams } = {}) {
  const current = (await sb(`zoom_connections?user_id=eq.${enc(userId)}&select=*&limit=1`))?.[0];
  if (current && ((accountId && current.account_id !== accountId) || (zoomUserId && current.zoom_user_id !== zoomUserId) || (connectionId && current.id !== connectionId))) return false;
  // Invalidate locally before network I/O so refresh/callback races cannot restore tokens.
  const revoked = await sb('rpc/zoom_disconnect', { method: 'POST', body: { p_user_id: userId, p_connection_id: current?.id || null } });
  if (!revoked) return false;
  let stopError;
  if (stopStreams) try { await stopStreams(); } catch (error) { stopError = error; }
  if (current?.token_ciphertext && revokeProvider) {
    try { const token = decryptZoomSecret(current.token_ciphertext, `${userId}:${current.id}`); await fetch('https://zoom.us/oauth/revoke', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: token.accessToken }) }); } catch { /* Local revocation remains authoritative. */ }
  }
  if (stopError) throw stopError;
  return true;
}
