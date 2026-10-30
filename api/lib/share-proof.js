import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL = 86400;
const TOKEN = /^[A-Za-z0-9_-]{24,128}$/;
const emailOf = email => String(email || '').trim().toLowerCase();
function signingKey(env) {
  const zoom = Buffer.from(env.ZOOM_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (zoom.length === 32) return zoom;
  const fallback = env.BOT_INGEST_SECRET;
  if (typeof fallback === 'string' && fallback.length >= 32) return Buffer.from(fallback);
  throw Object.assign(new Error('share_verification_not_configured'), { status: 503 });
}
function signature(token, email, expiry, env) {
  return createHmac('sha256', signingKey(env)).update(`octomeet-share-v1\0${token}\0${emailOf(email)}\0${expiry}`).digest();
}

// A share URL identifies a report; this signed, expiring proof confirms the
// recipient authenticated. Never accept the historical unsigned literal "1".
export function shareProof(token, email, { env = process.env, now = Date.now() } = {}) {
  if (!TOKEN.test(token || '') || !emailOf(email)) throw new Error('invalid_share_identity');
  const expiry = Math.floor(now / 1000) + TTL;
  return `v1.${expiry}.${signature(token, email, expiry, env).toString('base64url')}`;
}
export function validShareProof(value, token, email, { env = process.env, now = Date.now() } = {}) {
  if (!TOKEN.test(token || '') || !emailOf(email) || typeof value !== 'string' || !/^v1\.\d{10}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [, expiry, mac] = value.split('.');
  if (Number(expiry) <= now / 1000 || Number(expiry) > now / 1000 + TTL + 1) return false;
  try {
    const expected = signature(token, email, expiry, env), actual = Buffer.from(mac, 'base64url');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
export function shareProofCookie(token, email, options) {
  return `om_v_${token}=${shareProof(token, email, options)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`;
}
