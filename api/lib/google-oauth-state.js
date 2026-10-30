import { randomBytes, timingSafeEqual } from 'node:crypto';

export const GOOGLE_OAUTH_COOKIE = '__Host-om_google_oauth';
const TTL_MS = 10 * 60000;
const ORIGINS = new Set(['https://meet.octoplusteam.com', 'https://meet-ai-three-beige.vercel.app']);
const CALLBACK_PATH = '/api/auth/google/callback';
const validNonce = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const invalid = () => new Error('invalid_oauth_state');

export function googleRedirectUri(env = process.env) {
  const url = new URL(env.GOOGLE_REDIRECT_URI || 'https://meet-ai-three-beige.vercel.app' + CALLBACK_PATH);
  if (!ORIGINS.has(url.origin) || url.pathname !== CALLBACK_PATH || url.username || url.password || url.search || url.hash) throw invalid();
  return url.href;
}

export function googleRequestOrigin(req) {
  for (const value of [req.headers?.host, req.headers?.['x-forwarded-host']].filter(value => value != null)) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9.-]+$/.test(value) || !ORIGINS.has('https://' + value.toLowerCase())) throw invalid();
  }
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (typeof host !== 'string' || !/^[A-Za-z0-9.-]+$/.test(host)) throw invalid();
  const origin = 'https://' + host.toLowerCase();
  if (!ORIGINS.has(origin)) throw invalid();
  return origin;
}

function validateContext(context) {
  if (!context || Array.isArray(context) || !['normal', 'addon', 'share'].includes(context.mode)) throw invalid();
  if (context.mode === 'share') {
    if (typeof context.shareToken !== 'string' || !/^[A-Za-z0-9_-]{24,128}$/.test(context.shareToken)) throw invalid();
    return { mode: 'share', shareToken: context.shareToken };
  }
  return { mode: context.mode };
}

export const clearGoogleOAuthCookie = () => `${GOOGLE_OAUTH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// State carries only an unpredictable nonce. Mode/share context lives in a
// host-only HttpOnly cookie, so another origin cannot supply or replace it.
export function createGoogleOAuthState(context, { now = Date.now() } = {}) {
  const nonce = randomBytes(32).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ v: 1, nonce, issuedAt: now, context: validateContext(context) })).toString('base64url');
  return { state: nonce, cookie: `${GOOGLE_OAUTH_COOKIE}=${payload}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_MS / 1000}` };
}

export function consumeGoogleOAuthState(req, query, { now = Date.now(), env = process.env } = {}) {
  if (googleRequestOrigin(req) !== new URL(googleRedirectUri(env)).origin || query.getAll('state').length !== 1
    || query.getAll('code').length > 1 || query.getAll('error').length > 1 || (query.has('code') && query.has('error'))) throw invalid();
  const state = query.get('state');
  if (!validNonce(state)) throw invalid();
  const values = String(req.headers?.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(GOOGLE_OAUTH_COOKIE + '='));
  if (values.length !== 1) throw invalid();
  const raw = values[0].slice(GOOGLE_OAUTH_COOKIE.length + 1);
  if (raw.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw invalid();
  let payload;
  try { payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); } catch { throw invalid(); }
  if (payload?.v !== 1 || !validNonce(payload.nonce) || !Number.isSafeInteger(payload.issuedAt)
    || payload.issuedAt > now + 30000 || now - payload.issuedAt >= TTL_MS
    || !timingSafeEqual(Buffer.from(state), Buffer.from(payload.nonce))) throw invalid();
  return validateContext(payload.context);
}
