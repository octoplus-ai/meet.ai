import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createGoogleOAuthState, consumeGoogleOAuthState, clearGoogleOAuthCookie, googleRedirectUri, googleRequestOrigin, GOOGLE_OAUTH_COOKIE } from '../api/lib/google-oauth-state.js';

const canonical = 'meet-ai-three-beige.vercel.app', branded = 'meet.octoplusteam.com', shareToken = 'a'.repeat(48);
const env = { GOOGLE_REDIRECT_URI: `https://${canonical}/api/auth/google/callback`, GOOGLE_CLIENT_SECRET: 'fixture-secret', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' };
const response = () => ({ code: 200, headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, writeHead(code, headers) { this.code = code; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }, end(body) { this.body = body; } });
const cookieOf = issued => issued.cookie.split(';')[0];
const reqFor = (issued, extra = {}) => ({ method: 'GET', headers: { host: canonical, cookie: cookieOf(issued) }, url: '/api/auth/google/callback?code=fixture-code&state=' + issued.state, ...extra });
const decode = (req, options = {}) => consumeGoogleOAuthState(req, new URL(req.url, 'https://' + canonical).searchParams, { env, ...options });
const rawCookie = object => `${GOOGLE_OAUTH_COOKIE}=${Buffer.from(JSON.stringify(object)).toString('base64url')}`;
const readSource = async name => (await readFile(new URL(`../api/auth/google/${name}.js`, import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export default async function handler', 'async function handler');
const startSource = await readSource('start'), callbackSource = await readSource('callback');

function handlers({ providerFailure = false, verified = true } = {}) {
  const calls = [], writes = [];
  const bindings = { URL, URLSearchParams, Date, encodeURIComponent, console: { error() {} }, process: { env },
    createGoogleOAuthState, clearGoogleOAuthCookie, googleRequestOrigin,
    googleRedirectUri: () => googleRedirectUri(env),
    consumeGoogleOAuthState: (req, query) => consumeGoogleOAuthState(req, query, { env }),
    randomToken: () => 'fixture-session', shareProofCookie: (token, email) => `om_v_${token}=fixture-proof; Path=/; HttpOnly; Secure; SameSite=Lax`,
    resolveShareToken: async token => ({ email: 'reader@example.invalid', meeting: { id: 'shared-meeting' } }),
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === 'https://oauth2.googleapis.com/token') return { json: async () => providerFailure ? { error: 'PRIVATE_PROVIDER_ERROR', access_debug: 'PRIVATE_TOKEN' } : { access_token: 'fixture-access' } };
      if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') return { json: async () => ({ email: 'santiago@octoplusteam.com', email_verified: verified, name: 'Fixture' }) };
      throw new Error('Unexpected provider request');
    },
    sb: async (path, options) => { writes.push({ path, options }); return path.startsWith('app_users?email=') ? [{ id: 'fixture-user' }] : []; },
  };
  const start = vm.createContext({ ...bindings }), callback = vm.createContext({ ...bindings });
  vm.runInContext(startSource, start); vm.runInContext(callbackSource, callback);
  return { calls, writes, start: start.handler, callback: callback.handler };
}

test('all Google modes receive unpredictable browser-bound state with an expiring host-only cookie', () => {
  const seen = new Set();
  for (const context of [{ mode: 'normal' }, { mode: 'addon' }, { mode: 'share', shareToken }]) {
    const issued = createGoogleOAuthState(context);
    assert.match(issued.state, /^[A-Za-z0-9_-]{43}$/); assert.equal(seen.has(issued.state), false); seen.add(issued.state);
    assert.match(issued.cookie, /^__Host-om_google_oauth=/); assert.match(issued.cookie, /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
    assert.doesNotMatch(issued.cookie, /Domain=/); assert.deepEqual(decode(reqFor(issued)), context);
    assert.equal(issued.state.includes(shareToken), false);
  }
});

test('missing, wrong, expired, duplicate and malformed state fail closed before any OAuth exchange', async () => {
  const good = createGoogleOAuthState({ mode: 'normal' }), other = createGoogleOAuthState({ mode: 'addon' });
  const expired = createGoogleOAuthState({ mode: 'normal' }, { now: Date.now() - 10 * 60000 });
  const future = createGoogleOAuthState({ mode: 'normal' }, { now: Date.now() + 60000 });
  const cases = [
    { ...reqFor(good), headers: { host: canonical } },
    { ...reqFor(good), url: '/api/auth/google/callback?code=fixture' },
    { ...reqFor(good), url: '/api/auth/google/callback?state=addon&code=fixture' },
    { ...reqFor(good), url: '/api/auth/google/callback?state=share:' + shareToken + '&code=fixture' },
    { ...reqFor(good), headers: { host: canonical, cookie: cookieOf(other) } }, reqFor(expired), reqFor(future),
    { ...reqFor(good), headers: { host: branded, cookie: cookieOf(good) } },
    { ...reqFor(good), headers: { host: canonical, cookie: `${cookieOf(good)}; ${cookieOf(good)}` } },
    { ...reqFor(good), headers: { host: canonical, cookie: `${GOOGLE_OAUTH_COOKIE}=malformed` } },
    { ...reqFor(good), url: reqFor(good).url + '&state=' + good.state },
    { ...reqFor(good), url: reqFor(good).url + '&code=second' },
    { ...reqFor(good), url: reqFor(good).url + '&error=denied' },
  ];
  for (const req of cases) {
    const f = handlers(), res = response(); await f.callback(req, res);
    assert.equal(res.headers.location, '/?auth_error=oauth_state_invalid'); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
    assert.equal(res.headers['set-cookie'], clearGoogleOAuthCookie());
  }
});

test('state context cannot inject return URLs or use unsupported modes', () => {
  const issued = createGoogleOAuthState({ mode: 'normal' });
  const req = reqFor(issued);
  const payload = JSON.parse(Buffer.from(cookieOf(issued).split('=')[1], 'base64url').toString());
  payload.context = { mode: 'redirect', returnTo: 'https://attacker.invalid' }; req.headers.cookie = rawCookie(payload);
  assert.throws(() => decode(req), /invalid_oauth_state/);
  assert.throws(() => createGoogleOAuthState({ mode: 'share', shareToken: '../../invalid' }), /invalid_oauth_state/);
});

test('branded start canonicalizes before setting cookies and preserves only recognized flow context', async () => {
  for (const suffix of ['', '?addon=1', '?share=' + shareToken + '&auto=1']) {
    const f = handlers(), first = response();
    await f.start({ method: 'GET', headers: { host: branded }, url: '/api/auth/google/start' + suffix + (suffix ? '&' : '?') + 'returnTo=https://attacker.invalid' }, first);
    const location = new URL(first.headers.location);
    assert.equal(location.origin, 'https://' + canonical); assert.equal(location.pathname, '/api/auth/google/start');
    assert.equal(location.searchParams.has('returnTo'), false); assert.equal(first.headers['set-cookie'], undefined); assert.equal(f.calls.length, 0);
    const second = response(); await f.start({ method: 'GET', headers: { host: canonical }, url: location.pathname + location.search }, second);
    const google = new URL(second.headers.location); assert.equal(google.origin, 'https://accounts.google.com');
    assert.equal(google.searchParams.get('redirect_uri'), env.GOOGLE_REDIRECT_URI);
    const context = decode({ method: 'GET', headers: { host: canonical, cookie: second.headers['set-cookie'].split(';')[0] }, url: '/api/auth/google/callback?state=' + google.searchParams.get('state') });
    assert.equal(context.mode, suffix.includes('share=') ? 'share' : suffix.includes('addon=') ? 'addon' : 'normal');
    if (context.mode === 'share') { assert.equal(google.searchParams.get('scope'), 'openid email profile'); assert.equal(google.searchParams.get('prompt'), 'none'); }
  }
});

test('arbitrary callback configuration and forged request hosts never become redirect destinations', async () => {
  for (const uri of ['https://attacker.invalid/api/auth/google/callback', 'http://' + canonical + '/api/auth/google/callback', 'https://' + canonical + '/wrong', 'https://user:secret@' + canonical + '/api/auth/google/callback', env.GOOGLE_REDIRECT_URI + '?next=evil']) assert.throws(() => googleRedirectUri({ GOOGLE_REDIRECT_URI: uri }));
  for (const headers of [{ host: 'attacker.invalid' }, { host: canonical, 'x-forwarded-host': 'attacker.invalid' }, { host: 'attacker.invalid', 'x-forwarded-host': canonical }]) {
    const f = handlers(), res = response(); await f.start({ method: 'GET', headers, url: '/api/auth/google/start' }, res);
    assert.equal(res.headers.location, '/?auth_error=oauth_start_failed'); assert.equal(res.headers['set-cookie'], undefined);
  }
});

test('normal and addon callbacks preserve login behavior and consume state alongside the session cookie', async () => {
  for (const mode of ['normal', 'addon']) {
    const issued = createGoogleOAuthState({ mode }), f = handlers(), res = response(); await f.callback(reqFor(issued), res);
    assert.equal(f.calls.length, 2); assert.equal(f.writes.filter(call => call.path === 'sessions').length, 1);
    assert.equal(res.headers['set-cookie'][0], clearGoogleOAuthCookie()); assert.match(res.headers['set-cookie'][1], /^om_session=fixture-session;/);
    if (mode === 'normal') assert.equal(res.headers.location, '/');
    else { assert.match(res.headers['content-type'], /text\/html/); assert.match(res.body, /octomeet-token/); }
    // The browser applied the clear-cookie response: replay must not exchange code.
    const replay = response(); await f.callback({ ...reqFor(issued), headers: { host: canonical } }, replay);
    assert.equal(f.calls.length, 2); assert.equal(replay.headers.location, '/?auth_error=oauth_state_invalid');
  }
});

test('provider errors, denial and failed identity verification never expose payloads or create sessions', async () => {
  const issued = createGoogleOAuthState({ mode: 'normal' });
  for (const options of [{ providerFailure: true }, { verified: false }]) {
    const f = handlers(options), res = response(); await f.callback(reqFor(issued), res);
    assert.equal(res.headers.location, '/?auth_error=oauth_failed'); assert.equal(f.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(res), /PRIVATE_PROVIDER_ERROR|PRIVATE_TOKEN|fixture-secret/);
  }
  const share = createGoogleOAuthState({ mode: 'share', shareToken }), f = handlers(), res = response();
  await f.callback({ ...reqFor(share), url: '/api/auth/google/callback?state=' + share.state + '&error=PRIVATE_PROVIDER_ERROR' }, res);
  assert.equal(res.headers.location, '/?share=' + shareToken + '&gate=1'); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
});
