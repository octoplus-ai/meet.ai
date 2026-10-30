import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const zoomError = (code, status = 502) => Object.assign(new Error(code), { code, status });
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const secureEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const randomSecret = () => randomBytes(32).toString('base64url');
export function tokenKey(env = process.env) {
  const value = env.ZOOM_TOKEN_ENCRYPTION_KEY || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw zoomError('zoom_not_configured', 503);
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw zoomError('zoom_not_configured', 503);
  return key;
}
export function encryptZoomSecret(value, binding, env = process.env) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', tokenKey(env), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`octomeet:zoom:v1:${binding}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptZoomSecret(value, binding, env = process.env) {
  try {
    const [version, iv, tag, data, extra] = String(value).split('.');
    if (version !== 'v1' || extra || !iv || !tag || !data) throw new Error();
    const ivBytes = Buffer.from(iv, 'base64url'), tagBytes = Buffer.from(tag, 'base64url');
    if (ivBytes.length !== 12 || tagBytes.length !== 16 || ivBytes.toString('base64url') !== iv || tagBytes.toString('base64url') !== tag) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', tokenKey(env), ivBytes, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(`octomeet:zoom:v1:${binding}`)); decipher.setAuthTag(tagBytes);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
  } catch { throw zoomError('zoom_reconnect_required', 409); }
}
export function appOrigin(env = process.env) {
  try {
    const url = new URL(env.APP_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error();
    return url.origin;
  } catch { throw zoomError('zoom_not_configured', 503); }
}
export function requireZoomMutation(req) {
  if (req.headers.origin !== zoomRequestOrigin(req) || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw zoomError('invalid_origin', 403);
}
export function zoomAppOrigins(env = process.env) {
  const canonical = appOrigin(env);
  const values = env.ZOOM_APP_ORIGINS ? env.ZOOM_APP_ORIGINS.split(',').map(x => x.trim()) : [canonical];
  if (!values.length || values.length > 2) throw zoomError('zoom_not_configured', 503);
  const origins = values.map(value => appOrigin({ APP_URL: value }));
  if (!origins.includes(canonical) || new Set(origins).size !== origins.length) throw zoomError('zoom_not_configured', 503);
  return origins;
}
export function zoomRequestOrigin(req, env = process.env) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (typeof host !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(host)) throw zoomError('invalid_origin', 403);
  const origin = `https://${host.toLowerCase()}`;
  if (!zoomAppOrigins(env).includes(origin)) throw zoomError('invalid_origin', 403);
  return origin;
}
export function zoomRedirectUri(origin, env = process.env) {
  if (!zoomAppOrigins(env).includes(origin)) throw zoomError('invalid_origin', 403);
  return `${origin}/api/auth/zoom/callback`;
}
export function zoomStateCookie(nonce = '') {
  return `om_zoom_oauth=${nonce}; Path=/api/auth/zoom; HttpOnly; Secure; SameSite=Lax; Max-Age=${nonce ? 600 : 0}`;
}
export function verifyZoomWebhook(raw, headers, secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN, now = Date.now()) {
  if (!secret || !(typeof raw === 'string' || Buffer.isBuffer(raw)) || Buffer.byteLength(raw) > 262144) return false;
  const ts = headers['x-zm-request-timestamp'], signature = headers['x-zm-signature'];
  if (typeof ts !== 'string' || !/^\d{9,12}$/.test(ts) || typeof signature !== 'string' || !/^v0=[a-f0-9]{64}$/.test(signature) || Math.abs(now - Number(ts) * 1000) > 300000) return false;
  return secureEqual(signature, 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:`).update(raw).digest('hex'));
}
export function zoomWebhookChallenge(plainToken, secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN) {
  if (!secret || typeof plainToken !== 'string' || !plainToken || plainToken.length > 1024) throw zoomError('invalid_challenge', 400);
  return { plainToken, encryptedToken: createHmac('sha256', secret).update(plainToken).digest('hex') };
}
export async function zoomRawBody(req) {
  // Vercel restores the original bytes as data/end events and exposes a lazy JSON
  // getter separately. Never access that getter before authenticating the body.
  const raw = req.rawBody ?? Object.getOwnPropertyDescriptor(req, 'body')?.value;
  if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
    if (Buffer.byteLength(raw) > 262144) throw zoomError('body_too_large', 413);
    return Buffer.from(raw);
  }
  if (typeof req.on === 'function') return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', chunk => { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 262144) reject(zoomError('body_too_large', 413)); else chunks.push(bytes); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => reject(zoomError('raw_body_required', 400)));
    req.on('aborted', () => reject(zoomError('raw_body_required', 400)));
  });
  if (!req[Symbol.asyncIterator]) throw zoomError('raw_body_required', 400);
  const chunks = []; let size = 0;
  for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 262144) throw zoomError('body_too_large', 413); chunks.push(bytes); }
  return Buffer.concat(chunks);
}
export function safeRtmsServerUrls(value) {
  if (typeof value !== 'string' || value.length > 4096) throw zoomError('invalid_rtms_event', 400);
  const values = value.split(',').map(x => x.trim());
  if (!values.length || values.length > 8 || values.some(value => {
    try { const u = new URL(value); return u.protocol !== 'wss:' || !/(^|\.)zoom\.(us|com)$/.test(u.hostname) || u.username || u.password || (u.port && u.port !== '443') || u.hash; }
    catch { return true; }
  })) throw zoomError('invalid_rtms_event', 400);
  return values.join(',');
}
