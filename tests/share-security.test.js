import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { shareProof, validShareProof } from '../api/lib/share-proof.js';
import { subtitleTexts } from '../api/lib/subtitle-source.js';
import { createGoogleOAuthState, googleRedirectUri } from '../api/lib/google-oauth-state.js';

const previousEnv = { ...process.env }, originalFetch = globalThis.fetch;
Object.assign(process.env, { SUPABASE_URL: 'https://share-db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only',
  ZOOM_TOKEN_ENCRYPTION_KEY: '', BOT_INGEST_SECRET: 'share-proof-secret-fixture-only-32bytes', ANTHROPIC_API_KEY: 'fixture-only',
  ELEVENLABS_API_KEY: 'fixture-only', GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret',
  GMAIL_NOREPLY_USER: '', GMAIL_NOREPLY_PASS: '' });
const { authorizedShare } = await import('../api/lib/share.js');
const { createShareOtpHandler } = await import('../api/share-otp.js');
const handlers = Object.fromEntries(await Promise.all(['shared-report','share-auth','auth/google/callback','report-field','speaker-rename',
  'report-access','send-share','pretranslate','document','slides','artifacts','dub','recall/media','recall/frame','recall/thumb'].map(async name => [name, (await import(`../api/${name}.js`)).default])));
after(() => { globalThis.fetch = originalFetch; process.env = previousEnv; });
const id = '11111111-1111-4111-8111-111111111111', owner = '22222222-2222-4222-8222-222222222222';
const token = 'a'.repeat(48), email = 'reader@example.invalid', botId = 'fixture-bot';
const cookie = (value = shareProof(token, email)) => `om_v_${token}=${value}`;
const request = (body = {}, proof = '', extra = {}) => ({ method: 'POST', url: '/', headers: { cookie: proof }, body, ...extra });
const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, json(body) { this.body = body; return this; },
  end(body) { this.body = body; }, writeHead(code, headers) { this.statusCode = code; this.headers = { ...this.headers, ...headers }; },
  redirect(code, url) { this.statusCode = code; this.headers.location = url; } });

function fixture({ mode = 'inhouse_bot', role = 'Editor', revoked = false, linkAccess = 'restricted', googleEmail = email, emailVerified = true, otpEmail = email, connected = true } = {}) {
  const row = { id, user_id: owner, bot_id: botId, capture_mode: mode, status: 'done', title: 'Private fixture', link_access: linkAccess,
    share_token: token, shares: [{ token, email, role, revoked }], stage_info: {}, dubs: {},
    reports: { transcript: '[00:05] Alex: Original', summary: 'PRIVATE CONTENT', participants: [], action_items: [] } };
  const writes = [], calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input); calls.push(url.href);
    if (url.hostname === 'share-db.invalid') {
      const table = url.pathname.split('/').at(-1), query = url.searchParams;
      if (options.method && options.method !== 'GET') { writes.push({ table, query, body: JSON.parse(options.body || '{}') }); return Response.json([]); }
      if (table === 'sessions') return Response.json(query.get('token') === 'eq.owner' ? [{ user_id: owner }] : []);
      if (table === 'meetings') {
        if (query.has('id') && query.get('id') !== `eq.${id}`) return Response.json([]);
        if (query.has('user_id') && query.get('user_id') !== `eq.${owner}`) return Response.json([]);
        if (query.has('bot_id') && query.get('bot_id') !== `eq.${botId}`) return Response.json([]);
        if (query.has('shares') && !row.shares.some(share => query.get('shares').includes(share.token))) return Response.json([]);
        if (query.has('share_token') && query.get('share_token') !== `eq.${row.share_token}`) return Response.json([]);
        return Response.json([row]);
      }
      if (table === 'share_otps') return Response.json([{ id: 'otp-fixture', email: otpEmail, code: '123456', expires_at: new Date(Date.now() + 600000).toISOString(), attempts: 0 }]);
      if (table === 'reports') return Response.json([{ ...row.reports, subtitles: { English: ['Saved translation'] } }]);
      if (table === 'app_users') return Response.json([{ id: owner, email: 'owner@example.invalid', name: 'Fixture Owner' }]);
      if (table === 'oauth_tokens') return Response.json(connected ? [{ access_token: 'fixture-only', expiry: new Date(Date.now() + 3600000).toISOString() }] : []);
      if (table === 'artifacts') return Response.json([{ payload: { title: 'SAVED PRIVATE DOCUMENT', deck: { slides: [] } }, meta: {}, kind: 'doc' }]);
      throw new Error(`Unexpected synthetic database table: ${table}`);
    }
    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/tokeninfo') return Response.json({ aud: 'fixture-client', email: googleEmail, email_verified: emailVerified });
    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') return Response.json({ access_token: 'fixture-only' });
    if (url.hostname === 'www.googleapis.com' && url.pathname === '/oauth2/v3/userinfo') return Response.json({ email: googleEmail, email_verified: emailVerified, name: 'Fixture Reader' });
    if (url.hostname === 'gmail.googleapis.com') return Response.json({ id: 'fixture-email' });
    throw new Error(`External provider calls forbidden in this test: ${url.hostname}`);
  };
  return { row, writes, calls };
}

test('share proof binds token and verified email, expires, rejects unsigned/tampered values and supports the existing fallback key', () => {
  const env = { BOT_INGEST_SECRET: 'fixture-fallback-secret'.repeat(2) }, now = Date.now(), proof = shareProof(token, email, { env, now });
  assert.equal(validShareProof(proof, token, email.toUpperCase(), { env, now }), true);
  for (const bad of ['1', '', proof.replace('v1.', 'v2.'), proof.slice(0, -4) + 'abcd']) assert.equal(validShareProof(bad, token, email, { env, now }), false);
  assert.equal(validShareProof(proof, 'b'.repeat(48), email, { env, now }), false);
  assert.equal(validShareProof(proof, token, 'other@example.invalid', { env, now }), false);
  assert.equal(validShareProof(proof, token, email, { env, now: now + 86401000 }), false);
  assert.throws(() => shareProof(token, email, { env: {} }), /not_configured/);
  const zoom = { ZOOM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
  assert.equal(validShareProof(shareProof(token, email, { env: zoom }), token, email, { env: zoom }), true);
});

test('all platform shares require proof; role, meeting, bot, revocation and explicit public access remain scoped', async () => {
  for (const mode of ['inhouse_bot', 'zoom_rtms', 'recall']) {
    const f = fixture({ mode });
    for (const proof of ['', cookie('1'), cookie(shareProof(token, 'other@example.invalid'))]) assert.equal(await authorizedShare(request({}, proof), token, { meetingId: id }), null);
    assert.equal((await authorizedShare(request({}, cookie()), token, { meetingId: id, minRole: 'Editor' })).role, 'Editor');
    assert.equal(await authorizedShare(request({}, cookie()), token, { meetingId: 'wrong' }), null);
    assert.equal(await authorizedShare(request({}, cookie()), token, { botId: 'wrong' }), null);
    f.row.shares[0].role = 'Viewer';
    assert.equal(await authorizedShare(request({}, cookie()), token, { minRole: 'Editor' }), null);
    f.row.shares[0].revoked = true;
    assert.equal(await authorizedShare(request({}, cookie()), token), null);
    f.row.link_access = 'public';
    assert.equal(await authorizedShare(request({}, cookie()), token), null, 'revoked personal token cannot fall through to public access');
    f.row.shares = [];
    for (const access of ['restricted', undefined]) { f.row.link_access = access; assert.equal(await authorizedShare(request(), token), null); }
    f.row.link_access = 'public';
    assert.equal((await authorizedShare(request(), token)).role, 'Viewer');
    assert.equal(await authorizedShare(request(), token, { minRole: 'Editor' }), null);
    f.row.stage_info.deletion = true;
    assert.equal(await authorizedShare(request(), token), null);
  }
});

test('no-proof and forged-cookie requests cannot read private data, mutate reports, share by email or spend provider calls', async () => {
  for (const proof of ['', cookie('1'), cookie(shareProof(token, 'other@example.invalid'))]) {
    for (const name of ['shared-report','report-field','speaker-rename','report-access','send-share','pretranslate','document','slides','artifacts','dub','recall/media','recall/frame','recall/thumb']) {
      const f = fixture(), res = response();
      const read = ['shared-report','dub','recall/media','recall/frame','recall/thumb'].includes(name);
      await handlers[name](request({ meetingId: id, shareToken: token, field: 'summary', value: 'malicious', from: 'Alex', to: name === 'send-share' ? ['other@example.invalid'] : 'Changed', email: 'new@example.invalid', lang: 'English', texts: ['Original'] }, proof,
        { method: read ? 'GET' : 'POST', url: `/?token=${token}&share=${token}&meetingId=${id}&botId=${botId}&lang=en` }), res);
      if (name === 'artifacts') assert.deepEqual(res.body, { doc: false, deck: false });
      else if (name === 'recall/thumb') assert.match(res.headers.location, /email-cover\.png$/);
      else assert.ok([401,403,404].includes(res.statusCode), `${name}: ${res.statusCode}`);
      assert.equal(f.writes.length, 0, name);
      assert.equal(f.calls.every(url => new URL(url).hostname === 'share-db.invalid'), true, name);
      assert.doesNotMatch(JSON.stringify(res), /PRIVATE CONTENT|SAVED PRIVATE DOCUMENT/);
    }
  }
});

test('verified Editor can edit; Viewer cannot; owner sessions still work; shared cached artifacts remain readable', async () => {
  for (const role of ['Editor','Viewer']) {
    const f = fixture({ role }), res = response();
    await handlers['report-field'](request({ meetingId: id, shareToken: token, field: 'summary', value: 'Permitted edit' }, cookie()), res);
    assert.equal(res.statusCode, role === 'Editor' ? 200 : 403);
    assert.equal(f.writes.length, role === 'Editor' ? 1 : 0);
  }
  fixture(); const ownerRes = response();
  await handlers['report-field'](request({ meetingId: id, field: 'summary', value: 'Owner edit' }, 'om_session=owner'), ownerRes);
  assert.equal(ownerRes.statusCode, 200);
  for (const name of ['shared-report','document','slides']) {
    fixture({ role: 'Viewer' }); const res = response();
    await handlers[name](request({ meetingId: id, shareToken: token }, cookie(), { method: name === 'shared-report' ? 'GET' : 'POST', url: `/?token=${token}` }), res);
    assert.equal(res.statusCode, 200, name);
    if (name !== 'shared-report') assert.equal(res.body.cached, true);
  }
});

test('Google and OTP issue the same signed proof for legacy and native reports, only for verified invited identity', async () => {
  for (const mode of ['inhouse_bot','zoom_rtms']) {
    for (const verified of [false,true]) {
      fixture({ mode, emailVerified: verified }); const res = response();
      const oauthState = createGoogleOAuthState({ mode: 'share', shareToken: token });
      await handlers['auth/google/callback'](request({}, '', { method: 'GET', headers: { host: new URL(googleRedirectUri()).host, cookie: oauthState.cookie.split(';')[0] }, url: `/?state=${oauthState.state}&code=fixture` }), res);
      const cookies = [res.headers['set-cookie']].flat().filter(Boolean);
      const value = cookies.find(value => value.startsWith('om_v_'))?.match(/^om_v_[^=]+=([^;]+)/)?.[1];
      assert.equal(!!value, verified);
      if (value) assert.equal(validShareProof(value, token, email), true);
    }
    for (const googleEmail of [email,'other@example.invalid']) {
      fixture({ mode, googleEmail }); const res = response();
      await handlers['share-auth'](request({ token, credential: 'fixture' }), res);
      assert.equal(res.statusCode, googleEmail === email ? 200 : 403);
      assert.equal(!!res.headers['set-cookie'], googleEmail === email);
    }
    for (const otpEmail of [email,'old-recipient@example.invalid']) {
      fixture({ mode, otpEmail }); const res = response();
      await createShareOtpHandler()(request({ token, action: 'verify', code: '123456' }), res);
      assert.equal(res.statusCode, otpEmail === email ? 200 : 401);
      const value = res.headers['set-cookie']?.match(/^om_v_[^=]+=([^;]+)/)?.[1];
      if (value) assert.equal(validShareProof(value, token, email), true);
    }
  }
});

test('OTP does not claim email was sent when Google is disconnected; existing SMTP fallback must confirm delivery', async () => {
  for (const smtp of [false,true]) {
    fixture({ connected: false });
    process.env.GMAIL_NOREPLY_USER = smtp ? 'fixture@example.invalid' : '';
    process.env.GMAIL_NOREPLY_PASS = smtp ? 'fake-not-a-credential' : '';
    let gmailCalls = 0, smtpCalls = 0;
    const handler = createShareOtpHandler({ sendGmail: async () => { gmailCalls++; return { ok: false }; }, sendSmtp: async () => { smtpCalls++; return { ok: true }; } });
    const res = response(); await handler(request({ token, action: 'request' }), res);
    assert.equal(res.statusCode, smtp ? 200 : 503);
    assert.equal(gmailCalls, 0); assert.equal(smtpCalls, smtp ? 1 : 0);
    if (!smtp) assert.deepEqual(res.body, { error: 'email_unavailable' });
  }
  fixture({ connected: true });
  const failed = response();
  await createShareOtpHandler({ sendGmail: async () => ({ ok: false, error: 'needScope' }), sendSmtp: async () => ({ ok: false }) })(request({ token, action: 'request' }), failed);
  assert.equal(failed.statusCode, 503, 'Failed Google and SMTP delivery never claims the code was sent');
  process.env.GMAIL_NOREPLY_USER = ''; process.env.GMAIL_NOREPLY_PASS = '';
});

test('an Editor may add only new Viewers through send-share, never create another Editor', async () => {
  const f = fixture(), res = response();
  await handlers['send-share'](request({ meetingId: id, shareToken: token, to: ['new@example.invalid'], role: 'Editor' }, cookie()), res);
  assert.equal(res.statusCode, 200);
  const updated = f.writes.find(write => write.table === 'meetings')?.body.shares;
  assert.equal(updated.find(share => share.email === 'new@example.invalid')?.role, 'Viewer');
  const deniedFixture = fixture(), denied = response();
  await handlers['send-share'](request({ meetingId: id, shareToken: token, to: [email], role: 'Editor' }, cookie()), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(deniedFixture.calls.some(url => new URL(url).hostname === 'gmail.googleapis.com'), false);
});

test('subtitle translation uses exact saved transcript turns and cannot overwrite the cache with arbitrary viewer text', async () => {
  assert.deepEqual(subtitleTexts('[00:05] Alex: First\ncontinuation\n[125] Speaker 1: Second\n[1:02:03] Jane Doe (External): Third'), ['First continuation','Second','Third']);
  for (const texts of [['Original'],['Injected text']]) {
    const f = fixture({ role: 'Viewer' }), res = response();
    await handlers.pretranslate(request({ meetingId: id, shareToken: token, lang: 'English', texts }, cookie()), res);
    assert.equal(res.statusCode, texts[0] === 'Original' ? 200 : 400);
    assert.equal(f.writes.length, 0);
    if (res.statusCode === 200) assert.deepEqual(res.body.lines, ['Saved translation']);
  }
});
