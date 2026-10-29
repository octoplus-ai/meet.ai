import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { authorizedLegacyMedia, legacyMediaKey, serializeLegacyMedia, signedLegacyMediaUrl, streamLegacyMedia } from '../api/lib/legacy-media.js';
import mediaHandler from '../api/media/access.js';

const env = { R2_ACCOUNT_ID: 'a'.repeat(32), R2_BUCKET: 'legacy-recordings', R2_PRIVATE_BUCKET: 'private-rtms',
  R2_LEGACY_ACCESS_KEY_ID: 'legacy-fixture-access', R2_LEGACY_SECRET_ACCESS_KEY: 'legacy-fixture-secret',
  R2_ACCESS_KEY_ID: 'rtms-fixture-access', R2_SECRET_ACCESS_KEY: 'rtms-fixture-secret' };
const user = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const share = 'share-fixture-token'.padEnd(40, 'x');
const prefix = `recordings/${user}/${id}`;
const expired = `https://${env.R2_BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${prefix}.mp4?X-Amz-Date=20261001T000000Z&X-Amz-Expires=604800&X-Amz-Signature=expired-fixture`;
const meeting = (patch = {}) => ({ id, user_id: user, capture_mode: 'inhouse_bot', status: 'done', recording_url: expired,
  cover_url: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${prefix}-cover.jpg?X-Amz-Date=20261001T000000Z`, link_access: 'restricted', ...patch });
const request = (extra = {}) => ({ method: 'GET', url: `/api/media/access?meetingId=${id}`, headers: {}, ...extra });
class ResponseSink extends Writable {
  constructor() { super(); this.code = 200; this.headers = {}; this.chunks = []; }
  _write(chunk, encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
  status(code) { this.code = code; return this; }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
}

test('expired virtual-hosted recording and path-style cover become stable authenticated playback URLs', () => {
  const original = meeting(), serialized = serializeLegacyMedia(original, null, { env });
  assert.equal(legacyMediaKey(original, 'recording', { env }), `${prefix}.mp4`);
  assert.equal(legacyMediaKey(original, 'cover', { env }), `${prefix}-cover.jpg`);
  assert.equal(serialized.recording_url, `/api/media/access?meetingId=${id}&kind=recording`);
  assert.equal(serialized.cover_url, `/api/media/access?meetingId=${id}&kind=cover`);
  assert.equal(original.recording_url, expired, 'Recovery must not rewrite the stored object reference');
  assert.equal(serializeLegacyMedia(original, share, { env }).recording_url.endsWith(`&share=${share}`), true);
  const rtms = meeting({ capture_mode: 'zoom_rtms', recording_url: '/api/zoom/media?meetingId=fixture' });
  assert.equal(serializeLegacyMedia(rtms, null, { env }), rtms, 'Private RTMS media keeps its own route');
});

test('legacy resolution rejects arbitrary URLs, cross-tenant paths and deleted meetings', () => {
  for (const recording_url of [expired.replace(user, other), expired.replace(env.R2_ACCOUNT_ID, 'b'.repeat(32)),
    expired.replace(env.R2_BUCKET, env.R2_PRIVATE_BUCKET), 'https://example.invalid/' + prefix + '.mp4',
    'http://127.0.0.1/recording.mp4', expired.replace('https://', 'https://user:password@'),
    `r2:private/${user}/${id}/recording.mp4`, expired.replace(`${id}.mp4`, 'another.mp4'), expired.replace(`${id}.mp4`, `${id}.mp4%2Fextra`)]) {
    assert.equal(legacyMediaKey(meeting({ recording_url }), 'recording', { env }), null);
  }
  for (const patch of [{ status: 'skipped' }, { stage_info: { deletion: true } }, { capture_mode: 'zoom_rtms' }]) {
    assert.equal(legacyMediaKey(meeting(patch), 'recording', { env }), null);
  }
  const webm = meeting({ recording_url: expired.replace('.mp4?', '.webm?') });
  assert.equal(legacyMediaKey(webm, 'recording', { env }), `${prefix}.webm`);
});

test('new signatures use only the dedicated legacy credentials and current time, never the expired query', () => {
  const now = new Date('2026-10-29T20:00:00Z');
  const signed = new URL(signedLegacyMediaUrl(meeting(), 'recording', { env, now, ttl: 9999 }));
  assert.equal(signed.pathname, `/${env.R2_BUCKET}/${prefix}.mp4`);
  assert.equal(signed.searchParams.get('X-Amz-Date'), '20261029T200000Z');
  assert.equal(signed.searchParams.get('X-Amz-Expires'), '900');
  assert.equal(signed.searchParams.get('X-Amz-Credential').split('/')[0], env.R2_LEGACY_ACCESS_KEY_ID);
  assert.match(signed.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/);
  assert.equal(signed.href.includes('expired-fixture'), false);
  assert.equal(signed.href.includes(env.R2_LEGACY_SECRET_ACCESS_KEY), false);
  assert.notEqual(new URL(signedLegacyMediaUrl(meeting(), 'recording', { env, now, method: 'HEAD' })).searchParams.get('X-Amz-Signature'), signed.searchParams.get('X-Amz-Signature'));
  assert.throws(() => signedLegacyMediaUrl(meeting(), 'recording', { env: { ...env, R2_LEGACY_ACCESS_KEY_ID: '' } }), /legacy_storage_not_configured/);
});

test('media authorization requires an active owner session scoped to this meeting', async () => {
  const paths = [];
  const database = async path => {
    paths.push(path);
    if (path.startsWith('sessions?')) return path.includes('token=eq.owner') ? [{ user_id: user }] : [{ user_id: other }];
    return path.includes(`user_id=eq.${user}`) && path.includes(`id=eq.${id}`) ? [meeting()] : [];
  };
  const dependencies = { database, resolveShare: async () => null };
  assert.equal((await authorizedLegacyMedia(request({ headers: { cookie: 'om_session=owner' } }), id, null, dependencies)).id, id);
  assert.match(paths[0], /expires_at=gt\./);
  assert.match(paths[1], /capture_mode=eq.inhouse_bot/);
  assert.equal(await authorizedLegacyMedia(request({ headers: { cookie: 'om_session=other' } }), id, null, dependencies), null);
  assert.equal(await authorizedLegacyMedia(request(), id, null, dependencies), null);
  for (const patch of [{ status: 'skipped' }, { stage_info: { deletion: true } }]) {
    assert.equal(await authorizedLegacyMedia(request({ headers: { cookie: 'om_session=owner' } }), id, null,
      { database: async path => path.startsWith('sessions?') ? [{ user_id: user }] : [meeting(patch)] }), null);
  }
});

test('shared playback honors public/restricted and per-person verification, revocation and meeting identity', async () => {
  const noShare = async () => null;
  const publicDatabase = async path => path.includes(`share_token=eq.${share}`) ? [meeting({ link_access: 'public' })] : [];
  assert.equal((await authorizedLegacyMedia(request(), id, share, { database: publicDatabase, resolveShare: noShare })).id, id);
  assert.equal(await authorizedLegacyMedia(request(), id, share, { database: async () => [meeting()], resolveShare: noShare }), null);
  const resolveShare = async () => ({ meeting: meeting(), email: 'viewer@example.invalid' });
  const database = async () => [];
  assert.equal(await authorizedLegacyMedia(request(), id, share, { database, resolveShare }), null);
  const verified = request({ headers: { cookie: `om_v_${share}=1` } });
  assert.equal((await authorizedLegacyMedia(verified, id, share, { database, resolveShare })).id, id);
  assert.equal(await authorizedLegacyMedia(verified, id, share, { database, resolveShare: noShare }), null);
  assert.equal(await authorizedLegacyMedia(verified, other, share, { database, resolveShare }), null);
});

test('playback and preview seek ranges use fresh signatures and validate exact byte bounds', async () => {
  const headers = { 'content-type': 'video/mp4', 'content-length': '4', 'content-range': 'bytes 10-13/20' };
  const req = request({ headers: { range: 'bytes=10-13' } }), res = new ResponseSink();
  await streamLegacyMedia(req, res, meeting(), 'recording', { env, fetcher: async (url, options) => {
    assert.equal(url.includes('expired-fixture'), false);
    assert.equal(options.headers.Range, 'bytes=10-13'); assert.equal(options.redirect, 'error');
    return new Response('abcd', { status: 206, headers });
  } });
  assert.equal(res.code, 206); assert.equal(res.headers['content-range'], 'bytes 10-13/20');
  assert.equal(Buffer.concat(res.chunks).toString(), 'abcd');
  for (const [status, badHeaders] of [[200, headers], [206, { ...headers, 'content-range': 'bytes 11-14/20' }], [206, { ...headers, 'content-type': 'text/html' }]]) {
    await assert.rejects(streamLegacyMedia(req, new ResponseSink(), meeting(), 'recording', { env, fetcher: async () => new Response('abcd', { status, headers: badHeaders }) }), /invalid_media_response/);
  }
  let calls = 0;
  await assert.rejects(streamLegacyMedia(request({ headers: { range: 'bytes=0-1,3-4' } }), new ResponseSink(), meeting(), 'recording', { env, fetcher: async () => { calls++; } }), /invalid_range/);
  assert.equal(calls, 0);
});

test('cover and HEAD work without buffering a complete recording; downloads get a short-lived URL', async () => {
  const cover = new ResponseSink();
  await streamLegacyMedia(request(), cover, meeting(), 'cover', { env, fetcher: async () => new Response('jpeg', { headers: { 'content-type': 'image/jpeg', 'content-length': '4' } }) });
  assert.equal(Buffer.concat(cover.chunks).toString(), 'jpeg');
  const head = new ResponseSink();
  await streamLegacyMedia(request({ method: 'HEAD' }), head, meeting(), 'recording', { env, fetcher: async () => new Response(null, { headers: { 'content-type': 'video/mp4', 'content-length': '900000000' } }) });
  assert.equal(head.headers['content-length'], '900000000'); assert.equal(head.chunks.length, 0);
  const download = new ResponseSink();
  await streamLegacyMedia(request(), download, meeting(), 'recording', { env, fetcher: async () => assert.fail('Download must not buffer the recording') });
  assert.equal(download.code, 302); assert.equal(new URL(download.headers.location).searchParams.get('X-Amz-Expires'), '60');
});

test('unauthenticated and unsupported endpoint requests never expose storage URLs', async () => {
  for (const [req, code] of [[request(), 401], [request({ method: 'POST' }), 405]]) {
    const res = new ResponseSink(); await mediaHandler(req, res);
    assert.equal(res.code, code); assert.equal(res.headers.location, undefined);
    assert.equal(res.headers['cache-control'], 'private, no-store');
  }
});
