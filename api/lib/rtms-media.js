import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { sb } from './supa.js';
import { parseCookies } from './session.js';
import { resolveShareToken } from './share.js';

const enc = encodeURIComponent;
const ID = /^[a-f0-9-]{36}$/i;
const FILES = { recording: 'recording.mp4', cover: 'cover.jpg' };
const failure = (status, code) => Object.assign(new Error(code), { status, code });
export function rtmsMediaKey(meeting, kind) {
  if (!ID.test(meeting?.id || '') || !ID.test(meeting?.user_id || '') || !FILES[kind]) throw failure(400, 'invalid_media');
  return `private/${meeting.user_id}/${meeting.id}/${FILES[kind]}`;
}
export function rtmsMediaReference(meeting, kind) {
  if (meeting?.capture_mode !== 'zoom_rtms' || meeting.status === 'skipped' || meeting.stage_info?.deletion) return null;
  const ref = kind === 'recording' ? meeting.recording_url : meeting.cover_url;
  try { return ref === `r2:${rtmsMediaKey(meeting, kind)}` ? ref.slice(3) : null; } catch { return null; }
}
export function serializeRtmsMedia(meeting, share) {
  if (meeting?.capture_mode !== 'zoom_rtms') return meeting;
  const local = kind => rtmsMediaReference(meeting, kind) ? `/api/zoom/media?meetingId=${enc(meeting.id)}&kind=${kind}${share ? `&share=${enc(share)}` : ''}` : null;
  return { ...meeting, recording_url: local('recording'), cover_url: local('cover') };
}
function shareKey(env) {
  const key = Buffer.from(env.ZOOM_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw failure(503, 'zoom_not_configured');
  return key;
}
// Existing legacy cookies contain the literal "1". RTMS media never trusts that value.
export function rtmsShareProof(token, email, { env = process.env, now = Date.now() } = {}) {
  const expiry = Math.floor(now / 1000) + 86400;
  const mac = createHmac('sha256', shareKey(env)).update(`rtms-share\0${token}\0${String(email).toLowerCase()}\0${expiry}`).digest('base64url');
  return `${expiry}.${mac}`;
}
export function validRtmsShareProof(value, token, email, { env = process.env, now = Date.now() } = {}) {
  if (typeof value !== 'string' || !/^\d{10}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [expiry, signature] = value.split('.');
  if (Number(expiry) <= now / 1000 || Number(expiry) > now / 1000 + 86401) return false;
  try {
    const expected = createHmac('sha256', shareKey(env)).update(`rtms-share\0${token}\0${String(email).toLowerCase()}\0${expiry}`).digest();
    const actual = Buffer.from(signature, 'base64url'); return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
export async function authorizedRtmsMedia(req, meetingId, share, { database = sb, resolveShare = resolveShareToken } = {}) {
  if (!ID.test(meetingId || '') || (share && !/^[A-Za-z0-9_-]{24,128}$/.test(share))) return null;
  const cookies = parseCookies(req);
  let meeting;
  if (cookies.om_session) {
    const sessions = await database(`sessions?token=eq.${enc(cookies.om_session)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id&limit=1`);
    if (sessions?.[0]) meeting = (await database(`meetings?id=eq.${enc(meetingId)}&user_id=eq.${enc(sessions[0].user_id)}&capture_mode=eq.zoom_rtms&select=*&limit=1`))?.[0];
  }
  if (!meeting && share) {
    const shared = await resolveShare(share);
    if (shared?.meeting.id === meetingId && (!shared.email || validRtmsShareProof(cookies[`om_v_${share}`], share, shared.email))) meeting = shared.meeting;
    if (!meeting && !shared) {
      const rows = await database(`meetings?id=eq.${enc(meetingId)}&share_token=eq.${enc(share)}&capture_mode=eq.zoom_rtms&select=*&limit=1`);
      if (rows?.[0] && rows[0].link_access !== 'restricted') meeting = rows[0];
    }
  }
  return meeting?.capture_mode === 'zoom_rtms' && meeting.status !== 'skipped' && !meeting.stage_info?.deletion ? meeting : null;
}
export function signedRtmsMediaUrl(meeting, kind, { env = process.env, method = 'GET', ttl = 60, now = new Date() } = {}) {
  const key = rtmsMediaReference(meeting, kind);
  const bucket = env.R2_PRIVATE_BUCKET, account = env.R2_ACCOUNT_ID;
  if (!key) throw failure(404, 'media_not_found');
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(bucket || '') || bucket === env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw failure(503, 'private_storage_not_configured');
  if (!['GET', 'HEAD'].includes(method)) throw failure(400, 'invalid_method');
  const host = `${account}.r2.cloudflarestorage.com`, path = `/${enc(bucket)}/${key.split('/').map(enc).join('/')}`;
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = stamp.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const params = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${env.R2_ACCESS_KEY_ID}/${scope}`, 'X-Amz-Date': stamp, 'X-Amz-Expires': String(Math.max(1, Math.min(900, Math.floor(ttl) || 60))), 'X-Amz-SignedHeaders': 'host' };
  const query = Object.keys(params).sort().map(k => `${enc(k)}=${enc(params[k])}`).join('&');
  const canonical = [method, path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const hmac = (k, value) => createHmac('sha256', k).update(value).digest();
  const signing = hmac(hmac(hmac(hmac(`AWS4${env.R2_SECRET_ACCESS_KEY}`, day), 'auto'), 's3'), 'aws4_request');
  return `https://${host}${path}?${query}&X-Amz-Signature=${createHmac('sha256', signing).update(toSign).digest('hex')}`;
}
export const MEDIA_CHUNK = 4 * 1024 * 1024;
export function rtmsMediaRange(value) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw failure(416, 'invalid_range');
  const first = match[1] ? Number(match[1]) : null, last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last)) || (first === null ? last <= 0 : last !== null && last < first)) throw failure(416, 'invalid_range');
  return first === null ? `bytes=-${Math.min(last, MEDIA_CHUNK)}` : `bytes=${first}-${Math.min(last ?? Number.MAX_SAFE_INTEGER, first + MEDIA_CHUNK - 1)}`;
}
export async function streamRtmsMedia(req, res, meeting, kind, { fetcher = fetch } = {}) {
  if (!FILES[kind]) throw failure(400, 'invalid_media');
  const range = req.method === 'GET' ? rtmsMediaRange(req.headers.range) : null;
  const url = signedRtmsMediaUrl(meeting, kind, { method: req.method });
  // Whole downloads go directly to a short-lived, owner-authorized object URL.
  // Playback ranges stay behind the API so every seek rechecks access.
  if (req.method === 'GET' && !range && kind === 'recording') { res.status(302); res.setHeader('Location', url); return res.end(); }
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 55000);
  const close = () => controller.abort(); res.on?.('close', close);
  let upstream;
  try {
    upstream = await fetcher(url, { method: req.method, redirect: 'error', headers: range ? { Range: range } : {}, signal: controller.signal });
    if (upstream.status === 416) { res.status(416); return res.end(); }
    if (![200,206].includes(upstream.status)) throw failure(upstream.status === 404 ? 404 : 502, 'media_unavailable');
    if (range && upstream.status !== 206) throw failure(502, 'invalid_media_response');
    const rawLength = upstream.headers.get('content-length');
    if (typeof rawLength !== 'string' || !/^(0|[1-9]\d*)$/.test(rawLength)) throw failure(502, 'invalid_media_response');
    const length = Number(rawLength);
    if (!Number.isSafeInteger(length) || length < 0 || (req.method === 'GET' && length > MEDIA_CHUNK)) throw failure(502, 'invalid_media_response');
    const type = upstream.headers.get('content-type') || '';
    if (!(kind === 'recording' ? /^(video\/mp4|application\/octet-stream)(;|$)/i : /^image\/jpeg(;|$)/i).test(type)) throw failure(502, 'invalid_media_response');
    if (upstream.status === 206) {
      const parts = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(upstream.headers.get('content-range') || '');
      if (!range || !parts) throw failure(502, 'invalid_media_response');
      const [a,b,total] = parts.slice(1).map(Number);
      const requested = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (![a,b,total].every(Number.isSafeInteger) || b < a || total <= b || length !== b-a+1 || (requested[1] ? a !== Number(requested[1]) || b !== Math.min(Number(requested[2]),total-1) : b !== total-1 || a !== Math.max(0,total-Number(requested[2])))) throw failure(502, 'invalid_media_response');
      res.setHeader('Content-Range', upstream.headers.get('content-range'));
    }
    res.status(upstream.status); res.setHeader('Content-Type', type); res.setHeader('Content-Length', String(length)); res.setHeader('Accept-Ranges','bytes');
    if (req.method === 'HEAD') return res.end();
    if (!upstream.body) throw failure(502, 'media_unavailable');
    let received = 0;
    const bounded = new Transform({
      transform(chunk, encoding, done) {
        received += chunk.length;
        if (received > length || received > MEDIA_CHUNK) return done(failure(502, 'invalid_media_response'));
        done(null, chunk);
      },
      flush(done) { done(received === length ? null : failure(502, 'invalid_media_response')); },
    });
    await pipeline(Readable.fromWeb(upstream.body), bounded, res);
  } finally { clearTimeout(timeout); res.removeListener?.('close', close); await upstream?.body?.cancel().catch(() => {}); }
}
