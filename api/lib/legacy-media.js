// Historical in-house recordings stored seven-day R2 URLs in the meeting row.
// Keep that row intact, but resolve its owned object and sign on each playback request.
import { createHash, createHmac } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { sb } from './supa.js';
import { parseCookies } from './session.js';
import { authorizedShare, resolveShareToken } from './share.js';
import { MEDIA_CHUNK, rtmsMediaRange } from './rtms-media.js';

const enc = encodeURIComponent;
const ID = /^[a-f0-9-]{36}$/i;
const failure = (status, code) => Object.assign(new Error(code), { status, code });
const available = meeting => meeting?.capture_mode === 'inhouse_bot' && meeting.status !== 'skipped' && !meeting.stage_info?.deletion;

export function legacyMediaKey(meeting, kind, { env = process.env } = {}) {
  if (!available(meeting) || !ID.test(meeting.id || '') || !ID.test(meeting.user_id || '') || !['recording', 'cover'].includes(kind)) return null;
  const ref = kind === 'recording' ? meeting.recording_url : meeting.cover_url;
  if (typeof ref !== 'string') return null;
  const expected = kind === 'recording'
    ? [`recordings/${meeting.user_id}/${meeting.id}.mp4`, `recordings/${meeting.user_id}/${meeting.id}.webm`]
    : [`recordings/${meeting.user_id}/${meeting.id}-cover.jpg`];
  let url;
  try { url = new URL(ref); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const account = env.R2_ACCOUNT_ID, bucket = env.R2_BUCKET;
  if (!/^[a-f0-9]{32}$/i.test(account || '') || !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(bucket || '')) return null;
  let key;
  try {
    if (url.hostname === `${bucket}.${account}.r2.cloudflarestorage.com`) key = decodeURIComponent(url.pathname.slice(1));
    else if (url.hostname === `${account}.r2.cloudflarestorage.com` && url.pathname.startsWith(`/${enc(bucket)}/`)) key = decodeURIComponent(url.pathname.slice(enc(bucket).length + 2));
    else if (env.R2_PUBLIC_BASE) {
      const base = new URL(env.R2_PUBLIC_BASE), prefix = base.pathname.replace(/\/+$/, '') + '/';
      if (url.origin === base.origin && url.pathname.startsWith(prefix)) key = decodeURIComponent(url.pathname.slice(prefix.length));
    }
  } catch { return null; }
  return expected.includes(key) ? key : null;
}

export function serializeLegacyMedia(meeting, share, options) {
  if (meeting?.capture_mode !== 'inhouse_bot') return meeting;
  const local = kind => legacyMediaKey(meeting, kind, options)
    ? `/api/media/access?meetingId=${enc(meeting.id)}&kind=${kind}${share ? `&share=${enc(share)}` : ''}`
    : kind === 'recording' ? meeting.recording_url : meeting.cover_url;
  return { ...meeting, recording_url: local('recording'), cover_url: local('cover') };
}

export async function authorizedLegacyMedia(req, meetingId, share, { database = sb, resolveShare = resolveShareToken } = {}) {
  if (!ID.test(meetingId || '') || (share && !/^[A-Za-z0-9_-]{24,128}$/.test(share))) return null;
  const cookies = parseCookies(req);
  let meeting;
  if (cookies.om_session) {
    const sessions = await database(`sessions?token=eq.${enc(cookies.om_session)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id&limit=1`);
    if (sessions?.[0]) meeting = (await database(`meetings?id=eq.${enc(meetingId)}&user_id=eq.${enc(sessions[0].user_id)}&capture_mode=eq.inhouse_bot&select=*&limit=1`))?.[0];
  }
  if (!meeting && share) {
    meeting = (await authorizedShare(req, share, { meetingId, database, resolveShare }))?.meeting;
  }
  return available(meeting) ? meeting : null;
}

export function signedLegacyMediaUrl(meeting, kind, { env = process.env, method = 'GET', ttl = 60, now = new Date() } = {}) {
  const key = legacyMediaKey(meeting, kind, { env });
  if (!key) throw failure(404, 'media_not_found');
  // RTMS credentials are intentionally scoped to a different bucket. Never reuse them.
  if (!env.R2_LEGACY_ACCESS_KEY_ID || !env.R2_LEGACY_SECRET_ACCESS_KEY) throw failure(503, 'legacy_storage_not_configured');
  if (!['GET', 'HEAD'].includes(method)) throw failure(400, 'invalid_method');
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, path = `/${enc(env.R2_BUCKET)}/${key.split('/').map(enc).join('/')}`;
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), day = stamp.slice(0, 8), scope = `${day}/auto/s3/aws4_request`;
  const params = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${env.R2_LEGACY_ACCESS_KEY_ID}/${scope}`, 'X-Amz-Date': stamp, 'X-Amz-Expires': String(Math.max(1, Math.min(900, Math.floor(ttl) || 60))), 'X-Amz-SignedHeaders': 'host' };
  const query = Object.keys(params).sort().map(k => `${enc(k)}=${enc(params[k])}`).join('&');
  const canonical = [method, path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const hmac = (k, value) => createHmac('sha256', k).update(value).digest();
  const signing = hmac(hmac(hmac(hmac(`AWS4${env.R2_LEGACY_SECRET_ACCESS_KEY}`, day), 'auto'), 's3'), 'aws4_request');
  return `https://${host}${path}?${query}&X-Amz-Signature=${createHmac('sha256', signing).update(toSign).digest('hex')}`;
}

export async function streamLegacyMedia(req, res, meeting, kind, { fetcher = fetch, env = process.env } = {}) {
  if (!['recording', 'cover'].includes(kind)) throw failure(400, 'invalid_media');
  const range = req.method === 'GET' ? rtmsMediaRange(req.headers.range) : null;
  const url = signedLegacyMediaUrl(meeting, kind, { method: req.method, env });
  if (req.method === 'GET' && !range && kind === 'recording') { res.status(302); res.setHeader('Location', url); return res.end(); }
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 55000);
  const close = () => controller.abort(); res.on?.('close', close);
  let upstream;
  try {
    upstream = await fetcher(url, { method: req.method, redirect: 'error', headers: range ? { Range: range } : {}, signal: controller.signal });
    if (upstream.status === 416) { res.status(416); return res.end(); }
    if (![200, 206].includes(upstream.status)) throw failure(upstream.status === 404 ? 404 : 502, 'media_unavailable');
    if (range && upstream.status !== 206) throw failure(502, 'invalid_media_response');
    const rawLength = upstream.headers.get('content-length');
    if (typeof rawLength !== 'string' || !/^(0|[1-9]\d*)$/.test(rawLength)) throw failure(502, 'invalid_media_response');
    const length = Number(rawLength);
    if (!Number.isSafeInteger(length) || length < 0 || (req.method === 'GET' && length > MEDIA_CHUNK)) throw failure(502, 'invalid_media_response');
    const type = upstream.headers.get('content-type') || '';
    if (!(kind === 'recording' ? /^(video\/(mp4|webm)|application\/octet-stream)(;|$)/i : /^image\/jpeg(;|$)/i).test(type)) throw failure(502, 'invalid_media_response');
    if (upstream.status === 206) {
      const parts = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(upstream.headers.get('content-range') || '');
      if (!range || !parts) throw failure(502, 'invalid_media_response');
      const [a, b, total] = parts.slice(1).map(Number), requested = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (![a,b,total].every(Number.isSafeInteger) || b < a || total <= b || length !== b-a+1 || (requested[1] ? a !== Number(requested[1]) || b !== Math.min(Number(requested[2]), total-1) : b !== total-1 || a !== Math.max(0, total-Number(requested[2])))) throw failure(502, 'invalid_media_response');
      res.setHeader('Content-Range', upstream.headers.get('content-range'));
    }
    res.status(upstream.status); res.setHeader('Content-Type', type); res.setHeader('Content-Length', String(length)); res.setHeader('Accept-Ranges', 'bytes');
    if (req.method === 'HEAD') return res.end();
    if (!upstream.body) throw failure(502, 'media_unavailable');
    let received = 0;
    const bounded = new Transform({
      transform(chunk, encoding, done) { received += chunk.length; done(received > length || received > MEDIA_CHUNK ? failure(502, 'invalid_media_response') : null, chunk); },
      flush(done) { done(received === length ? null : failure(502, 'invalid_media_response')); },
    });
    await pipeline(Readable.fromWeb(upstream.body), bounded, res);
  } finally { clearTimeout(timeout); res.removeListener?.('close', close); await upstream?.body?.cancel().catch(() => {}); }
}
