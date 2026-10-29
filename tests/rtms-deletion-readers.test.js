import test, { after } from 'node:test';
import assert from 'node:assert/strict';
const originalFetch = globalThis.fetch, previousEnv = { ...process.env };
process.env.ANTHROPIC_API_KEY = 'offline-fixture';
const { default: pretranslate } = await import('../api/pretranslate.js');
const { default: reprocess } = await import('../api/reprocess-stale.js');
const { default: followup } = await import('../api/followup.js');
const { default: push } = await import('../api/push.js');
const { default: sendShare } = await import('../api/send-share.js');
after(() => { globalThis.fetch = originalFetch; process.env = previousEnv; });
const id = '33333333-3333-4333-8333-333333333333', owner = '11111111-1111-4111-8111-111111111111';
function fixture(mode) {
  const providerCalls = [], databaseCalls = [];
  const row = { id, user_id: owner, capture_mode: mode === 'legacy' ? 'inhouse_bot' : 'zoom_rtms',
    stage_info: mode === 'deleting' ? { deletion: 'requested' } : {}, status: 'done', title: 'Fixture meeting',
    cover_url: `r2:private/${owner}/${id}/cover.jpg`, shares: [],
    reports: { summary: 'Fixture discussion', report_version: mode === 'deleting' ? 0 : 99 } };
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url);
    if (address.includes('/rest/v1/')) {
      const path = address.split('/rest/v1/')[1]; databaseCalls.push({ path, options });
      if (path.startsWith('sessions?')) return Response.json([{ user_id: owner }]);
      if (path.startsWith('meetings?shares=')) return Response.json([]);
      if (path.startsWith('meetings?')) return Response.json([row]);
      if (path.startsWith('reports?')) return Response.json([{ subtitles: { es: ['Texto guardado'] } }]);
      if (path.startsWith('app_users?email=')) return Response.json([]);
      if (path.startsWith('app_users?')) return Response.json([{ name: 'Fixture owner', email: 'owner@example.invalid', integrations: { webhook: { url: 'https://fixture.example.invalid/hook' } } }]);
      if (path.startsWith('oauth_tokens?')) return Response.json([{ access_token: 'fixture-token', expiry: new Date(Date.now() + 3600000).toISOString() }]);
      throw new Error('Unexpected fixture DB path: ' + path);
    }
    providerCalls.push({ address, options });
    if (address === 'https://api.anthropic.com/v1/messages') return Response.json({ content: [{ text: JSON.stringify({ subject: 'Fixture subject', body: 'Fixture body' }) }] });
    if (address === 'https://fixture.example.invalid/hook' || address.startsWith('https://gmail.googleapis.com/')) return Response.json({ id: 'fixture-delivery' });
    throw new Error('External network is unavailable in this fixture: ' + address);
  };
  return { row, providerCalls, databaseCalls };
}
function response() { return { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } }; }
const request = (body, cookie = 'om_session=owner') => ({ method: 'POST', headers: { cookie }, body });

test('subtitle owner and public fallback deny deleting RTMS before cached content; active RTMS and legacy remain available', async () => {
  for (const mode of ['deleting', 'active', 'legacy']) for (const cookie of ['om_session=owner', '']) {
    const f = fixture(mode), res = response();
    await pretranslate(request({ meetingId: id, shareToken: 'public-token', lang: 'es', texts: ['Original'] }, cookie), res);
    assert.equal(res.code, mode === 'deleting' ? 403 : 200);
    assert.equal(f.providerCalls.length, 0);
    if (mode === 'deleting') assert.equal(f.databaseCalls.some(x => x.path.startsWith('reports?')), false);
    else assert.deepEqual(res.body.lines, ['Texto guardado']);
  }
});

test('automatic reprocessing excludes deletion tombstones before loading stored transcripts', async () => {
  for (const mode of ['deleting', 'active', 'legacy']) {
    const f = fixture(mode), res = response(); await reprocess(request({}), res);
    assert.equal(res.code, 200); assert.equal(res.body.updated, 0); assert.equal(res.body.remaining, 0);
    assert.equal(f.providerCalls.length, 0); assert.equal(f.databaseCalls.some(x => x.path.startsWith('reports?')), false);
  }
});

test('follow-up draft and send deny deleting RTMS before AI or email; existing drafts still work', async () => {
  for (const mode of ['deleting', 'active', 'legacy']) {
    const f = fixture(mode), res = response(); await followup(request({ meetingId: id, action: 'draft' }), res);
    assert.equal(res.code, mode === 'deleting' ? 401 : 200);
    assert.equal(f.providerCalls.length, mode === 'deleting' ? 0 : 1);
    if (mode !== 'deleting') assert.equal(res.body.subject, 'Fixture subject');
  }
  const f = fixture('deleting'), res = response(); await followup(request({ meetingId: id, action: 'send', to: ['viewer@example.invalid'] }), res);
  assert.equal(res.code, 401); assert.equal(f.providerCalls.length, 0);
});

test('integration push denies pending deletion but retains active RTMS and legacy delivery', async () => {
  for (const mode of ['deleting', 'active', 'legacy']) {
    const f = fixture(mode), res = response(); await push(request({ meetingId: id, target: 'webhook' }), res);
    assert.equal(res.code, mode === 'deleting' ? 404 : 200);
    assert.equal(f.providerCalls.length, mode === 'deleting' ? 0 : 1);
    if (mode !== 'deleting') assert.equal(res.body.ok, true);
  }
});

test('manual share email denies pending deletion; active paths deliver and native covers remain private', async () => {
  for (const mode of ['deleting', 'active', 'legacy']) {
    const f = fixture(mode), res = response(); await sendShare(request({ meetingId: id, to: ['viewer@example.invalid'] }), res);
    assert.equal(res.code, mode === 'deleting' ? 401 : 200);
    assert.equal(f.providerCalls.length, mode === 'deleting' ? 0 : 1);
    if (mode !== 'deleting') assert.equal(res.body.sent, 1);
    if (mode === 'active') {
      const mime = Buffer.from(JSON.parse(f.providerCalls[0].options.body).raw, 'base64url').toString();
      const content = mime.split('Content-Transfer-Encoding: base64\r\n\r\n').slice(1).map(part => Buffer.from(part.split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString()).join('\n');
      assert.doesNotMatch(content, /r2:private|cloudflarestorage/);
    }
  }
});
