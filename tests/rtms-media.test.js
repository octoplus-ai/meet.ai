import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { authorizedRtmsMedia, MEDIA_CHUNK, rtmsMediaRange, rtmsMediaReference, rtmsShareProof, serializeRtmsMedia, signedRtmsMediaUrl, streamRtmsMedia, validRtmsShareProof } from '../api/lib/rtms-media.js';

const previousEnv = { ...process.env }, originalFetch = globalThis.fetch;
Object.assign(process.env, {
  ZOOM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_PRIVATE_BUCKET: 'private-fixtures', R2_BUCKET: 'legacy-fixtures', R2_ACCESS_KEY_ID: 'fixture-access',
  R2_SECRET_ACCESS_KEY: 'fixture-secret-not-real', ELEVENLABS_API_KEY: 'fixture-elevenlabs',
});
after(() => { process.env = previousEnv; globalThis.fetch = originalFetch; });
const { default: mediaHandler } = await import('../api/zoom/media.js');
const { default: dubHandler } = await import('../api/dub.js');
const { recapCoverUrl } = await import('../api/lib/process.js');
const user = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333', different = '44444444-4444-4444-8444-444444444444';
const share = 'share-fixture-token'.padEnd(40, 'x'), email = 'viewer@example.invalid';
const meeting = () => ({ id, user_id: user, capture_mode: 'zoom_rtms', status: 'done', stage_info: {},
  recording_url: `r2:private/${user}/${id}/recording.mp4`, cover_url: `r2:private/${user}/${id}/cover.jpg`,
  dubs: { es: { id: 'dub-fixture', status: 'dubbed' } }, link_access: 'restricted' });
class ResponseSink extends Writable {
  constructor() { super(); this.code = 200; this.headers = {}; this.chunks = []; }
  _write(chunk, encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
  status(code) { this.code = code; return this; }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  json(value) { this.value = value; this.end(JSON.stringify(value)); return this; }
}
const request = (cookie = '', extra = {}) => ({ method: 'GET', url: `/api/zoom/media?meetingId=${id}`, headers: { cookie }, ...extra });
const noShare = async () => null;

test('owner authorization is scoped by active session, meeting and owner, and never accepts another user reference', async () => {
  const paths = [];
  const database = async path => {
    paths.push(path);
    if (path.startsWith('sessions?')) return path.includes('token=eq.owner') ? [{ user_id: user }] : [{ user_id: other }];
    return path.includes(`user_id=eq.${user}`) && path.includes(`id=eq.${id}`) ? [meeting()] : [];
  };
  assert.equal((await authorizedRtmsMedia(request('om_session=owner'), id, null, { database, resolveShare: noShare })).id, id);
  assert.match(paths[0], /expires_at=gt\./);
  assert.equal(await authorizedRtmsMedia(request('om_session=other'), id, null, { database, resolveShare: noShare }), null);
  assert.equal(await authorizedRtmsMedia(request('om_session=owner'), different, null, { database, resolveShare: noShare }), null);
  assert.equal(rtmsMediaReference({ ...meeting(), recording_url: `r2:private/${other}/${id}/recording.mp4` }, 'recording'), null);
  for (const patch of [{ status: 'skipped' }, { stage_info: { deletion: true } }]) {
    const resolved = await authorizedRtmsMedia(request('om_session=owner'), id, null, { database: async path => path.startsWith('sessions?') ? [{ user_id: user }] : [{ ...meeting(), ...patch }], resolveShare: noShare });
    assert.equal(resolved, null);
  }
});

test('personal share media needs a valid HMAC proof; old cookies, expiry, other recipient and revocation fail closed', async () => {
  const proof = rtmsShareProof(share, email), resolveShare = async () => ({ meeting: meeting(), email });
  const database = async () => [];
  const authorize = (cookie, resolve = resolveShare) => authorizedRtmsMedia(request(cookie), id, share, { database, resolveShare: resolve });
  assert.equal((await authorize(`om_v_${share}=${proof}`)).id, id);
  const tampered = proof.slice(0, 11) + (proof[11] === 'A' ? 'B' : 'A') + proof.slice(12);
  for (const value of ['1', tampered, rtmsShareProof(share, 'other@example.invalid'), rtmsShareProof(share, email, { now: Date.now() - 86500000 })]) {
    assert.equal(await authorize(`om_v_${share}=${value}`), null);
  }
  assert.equal(await authorize(`om_v_${share}=${proof}`, noShare), null, 'A revoked personal token no longer resolves');
  assert.equal(validRtmsShareProof(proof, 'another-token', email), false);
  const publicDb = async path => path.includes(`share_token=eq.${share}`) ? [{ ...meeting(), link_access: 'public' }] : [];
  assert.equal((await authorizedRtmsMedia(request(), id, share, { database: publicDb, resolveShare: noShare })).id, id);
  assert.equal(await authorizedRtmsMedia(request(), id, share, { database: async () => [meeting()], resolveShare: noShare }), null);
});

test('serialized media stays behind authenticated endpoints and signatures bind private owner object, method and bounded expiry', () => {
  const row = serializeRtmsMedia(meeting(), share);
  assert.equal(row.recording_url, `/api/zoom/media?meetingId=${id}&kind=recording&share=${share}`);
  assert.equal(row.cover_url.includes('r2:'), false);
  const now = new Date('2026-10-29T12:00:00Z');
  const signed = new URL(signedRtmsMediaUrl(meeting(), 'recording', { now, ttl: 9000 }));
  assert.equal(signed.hostname, `${'a'.repeat(32)}.r2.cloudflarestorage.com`);
  assert.equal(signed.pathname, `/private-fixtures/private/${user}/${id}/recording.mp4`);
  assert.equal(signed.searchParams.get('X-Amz-Expires'), '900');
  assert.equal(signed.searchParams.get('X-Amz-Date'), '20261029T120000Z');
  assert.equal(signed.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(signed.searchParams.get('X-Amz-Signature'), /^[a-f0-9]{64}$/);
  assert.notEqual(new URL(signedRtmsMediaUrl(meeting(), 'recording', { now, ttl: 900, method: 'HEAD' })).searchParams.get('X-Amz-Signature'), signed.searchParams.get('X-Amz-Signature'));
  assert.equal(signed.href.includes('fixture-secret-not-real'), false);
  assert.throws(() => signedRtmsMediaUrl({ ...meeting(), recording_url: `r2:private/${other}/${id}/recording.mp4` }, 'recording'), /media_not_found/);
  assert.throws(() => signedRtmsMediaUrl(meeting(), 'recording', { env: { ...process.env, R2_PRIVATE_BUCKET: process.env.R2_BUCKET } }), /private_storage_not_configured/);
});

test('media ranges are bounded and malformed/multiple requests never reach upstream', async () => {
  assert.equal(rtmsMediaRange('bytes=0-'), `bytes=0-${MEDIA_CHUNK - 1}`);
  assert.equal(rtmsMediaRange('bytes=-99999999'), `bytes=-${MEDIA_CHUNK}`);
  for (const range of ['bytes=4-2', 'bytes=-0', 'bytes=0-1,3-4', 'bytes=99999999999999999-', 'bytes=-', 'items=0-2']) {
    let called = false;
    await assert.rejects(streamRtmsMedia(request('', { headers: { range } }), new ResponseSink(), meeting(), 'recording', { fetcher: async () => { called = true; } }), /invalid_range/);
    assert.equal(called, false);
  }
});

test('range playback requires valid 206 and lengths; missing length, ignored range, wrong bounds and bodies are rejected', async () => {
  const req = request('', { headers: { range: 'bytes=10-13' } });
  const validHeaders = { 'content-type': 'video/mp4', 'content-length': '4', 'content-range': 'bytes 10-13/20' };
  const bad = [
    [200, validHeaders], [206, { ...validHeaders, 'content-length': undefined }],
    [206, { ...validHeaders, 'content-length': '' }], [206, { ...validHeaders, 'content-length': '0' }],
    [206, { ...validHeaders, 'content-range': 'bytes 11-14/20' }], [206, { ...validHeaders, 'content-range': 'bytes 10-12/20', 'content-length': '3' }],
    [206, { ...validHeaders, 'content-type': 'text/html' }],
  ];
  for (const [status, headers] of bad) {
    const clean = Object.fromEntries(Object.entries(headers).filter(([,value]) => value !== undefined));
    await assert.rejects(streamRtmsMedia(req, new ResponseSink(), meeting(), 'recording', { fetcher: async () => new Response('abcd', { status, headers: clean }) }), /invalid_media_response/);
  }
  const response = new ResponseSink();
  await streamRtmsMedia(req, response, meeting(), 'recording', { fetcher: async (url, opts) => {
    assert.equal(opts.headers.Range, 'bytes=10-13'); assert.equal(opts.redirect, 'error');
    return new Response('abcd', { status: 206, headers: validHeaders });
  } });
  assert.equal(response.code, 206); assert.equal(Buffer.concat(response.chunks).toString(), 'abcd');
  for (const body of ['abc', 'abcde']) await assert.rejects(streamRtmsMedia(req, new ResponseSink(), meeting(), 'recording', { fetcher: async () => new Response(body, { status: 206, headers: validHeaders }) }), /invalid_media_response/);
});

test('HEAD requires an explicit length; complete downloads redirect to a short-lived private URL after authorization', async () => {
  await assert.rejects(streamRtmsMedia(request('', { method: 'HEAD' }), new ResponseSink(), meeting(), 'recording', { fetcher: async () => new Response(null, { headers: { 'content-type': 'video/mp4' } }) }), /invalid_media_response/);
  const head = new ResponseSink();
  await streamRtmsMedia(request('', { method: 'HEAD' }), head, meeting(), 'recording', { fetcher: async () => new Response(null, { headers: { 'content-type': 'video/mp4', 'content-length': '9000000' } }) });
  assert.equal(head.code, 200); assert.equal(head.headers['content-length'], '9000000'); assert.equal(head.chunks.length, 0);
  const download = new ResponseSink();
  await streamRtmsMedia(request(), download, meeting(), 'recording', { fetcher: async () => { throw new Error('Whole downloads must not buffer upstream data'); } });
  assert.equal(download.code, 302); assert.equal(new URL(download.headers.location).searchParams.get('X-Amz-Expires'), '60');
  const denied = new ResponseSink();
  globalThis.fetch = async () => { throw new Error('Unauthenticated media must not access providers'); };
  await mediaHandler(request(), denied); assert.equal(denied.code, 401); assert.equal(denied.headers.location, undefined);
  assert.equal(denied.headers['cache-control'], 'private, no-store');
});

function mockDub({ row = meeting(), owner = true, revoked = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const value = String(url); calls.push({ url: value, opts });
    if (value.includes('/rest/v1/')) {
      const path = value.split('/rest/v1/')[1], query = new URLSearchParams(path.split('?')[1]);
      if (path.startsWith('sessions?')) return Response.json([{ user_id: owner ? user : other }]);
      if (path.startsWith('app_users?')) return Response.json([{ id: user, email: 'owner@example.invalid', plan: 'pro' }]);
      if (path.startsWith('meetings?')) {
        if (opts.method === 'PATCH') return Response.json([]);
        if (query.has('user_id') && query.get('user_id') !== `eq.${row.user_id}`) return Response.json([]);
        if (query.has('shares')) return Response.json(revoked ? [] : [{ ...row, shares: [{ token: share, email, role: 'Viewer' }] }]);
        if (query.has('share_token')) return Response.json([]);
        return Response.json([row]);
      }
    }
    if (value === 'https://api.elevenlabs.io/v1/dubbing' && opts.method === 'POST') return Response.json({ dubbing_id: 'new-fixture' });
    if (value === 'https://api.elevenlabs.io/v1/dubbing/dub-fixture/audio/es') return new Response('dubbed-fixture', { headers: { 'content-type': 'video/mp4' } });
    throw new Error(`Unexpected request in offline test: ${value}`);
  };
  return calls;
}

test('native Zoom dubbing POST sends a 15-minute signed URL to ElevenLabs, never a raw private reference', async () => {
  const calls = mockDub(), response = new ResponseSink();
  await dubHandler({ method: 'POST', url: '/api/dub', headers: { cookie: 'om_session=owner' }, body: { meetingId: id, lang: 'fr', action: 'start' } }, response);
  assert.equal(response.code, 200); assert.equal(response.value.id, 'new-fixture');
  const sent = calls.find(call => call.url === 'https://api.elevenlabs.io/v1/dubbing');
  const source = new URL(sent.opts.body.get('source_url'));
  assert.equal(source.searchParams.get('X-Amz-Expires'), '900'); assert.equal(source.pathname, `/private-fixtures/private/${user}/${id}/recording.mp4`);
  assert.equal(calls.some(call => call.url.includes('recall')), false);
  assert.ok(calls.some(call => call.url.includes('select=id,user_id,bot_id,dubs,duration_min,recording_url,cover_url,capture_mode,status,stage_info')));
  const forged = mockDub({ row: { ...meeting(), recording_url: `r2:private/${other}/${id}/recording.mp4` } }), denied = new ResponseSink();
  await dubHandler({ method: 'POST', url: '/api/dub', headers: { cookie: 'om_session=owner' }, body: { meetingId: id, lang: 'fr' } }, denied);
  assert.notEqual(denied.code, 200); assert.equal(forged.some(call => call.url.startsWith('https://api.elevenlabs.io')), false);
});

test('dubbed Zoom playback enforces the same personal share proof and revocation as primary media', async () => {
  for (const cookie of ['', `om_v_${share}=1`, `om_v_${share}=${rtmsShareProof(share, 'wrong@example.invalid')}`]) {
    const calls = mockDub({ owner: false }), response = new ResponseSink();
    await dubHandler({ method: 'GET', url: `/api/dub?meetingId=${id}&lang=es&share=${share}`, headers: { cookie } }, response);
    assert.equal(response.code, 401); assert.equal(calls.some(call => call.url.startsWith('https://api.elevenlabs.io')), false);
  }
  const proof = rtmsShareProof(share, email), calls = mockDub({ owner: false }), response = new ResponseSink();
  await dubHandler({ method: 'GET', url: `/api/dub?meetingId=${id}&lang=es&share=${share}`, headers: { cookie: `om_v_${share}=${proof}` } }, response);
  assert.equal(response.code, 200); assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.equal(calls.filter(call => call.url.startsWith('https://api.elevenlabs.io')).length, 1);
  const revoked = mockDub({ owner: false, revoked: true }), denied = new ResponseSink();
  await dubHandler({ method: 'GET', url: `/api/dub?meetingId=${id}&lang=es&share=${share}`, headers: { cookie: `om_v_${share}=${proof}` } }, denied);
  assert.equal(denied.code, 401); assert.equal(revoked.some(call => call.url.startsWith('https://api.elevenlabs.io')), false);
});

test('recap email omits every private RTMS cover while legacy covers remain unchanged', () => {
  assert.equal(recapCoverUrl(meeting(), share), '');
  assert.equal(recapCoverUrl({ ...meeting(), bot_id: 'old-bot', cover_url: 'https://signed.example.invalid/private' }, share), '');
  assert.equal(recapCoverUrl({ capture_mode: 'inhouse_bot', cover_url: 'https://public.example.invalid/cover.jpg' }, share), 'https://public.example.invalid/cover.jpg');
});
