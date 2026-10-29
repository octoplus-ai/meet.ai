import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { requestDeletion, deletionMessage, pendingDeletionItems } from '../src/media/deletion.js';
const previousEnv = { ...process.env }, originalFetch = globalThis.fetch;
Object.assign(process.env, { ANTHROPIC_API_KEY: 'fixture-ai', ELEVENLABS_API_KEY: 'fixture-dub', ZOOM_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') });
const { default: meetingsHandler } = await import('../api/meetings.js');
const { default: sharedHandler } = await import('../api/shared-report.js');
const { default: dubHandler } = await import('../api/dub.js');
const { default: documentHandler } = await import('../api/document.js');
const { default: slidesHandler } = await import('../api/slides.js');
const { default: askHandler } = await import('../api/ask.js');
const { ensureShareToken, resolveShareToken } = await import('../api/lib/share.js');
after(() => { process.env = previousEnv; globalThis.fetch = originalFetch; });
const owner = '11111111-1111-4111-8111-111111111111', id = '33333333-3333-4333-8333-333333333333';
const token = 'pending-personal-token'.padEnd(40, 'x');
const privateContent = 'PRIVATE_DELETION_PENDING_TRANSCRIPT';
const pending = () => ({ id, user_id: owner, capture_mode: 'zoom_rtms', status: 'done', stage_info: { deletion: 'requested' },
  title: privateContent, reports: { transcript: privateContent, summary: privateContent }, share_token: token,
  shares: [{ token, email: 'viewer@example.invalid', role: 'Viewer' }], link_access: 'public',
  recording_url: `r2:private/${owner}/${id}/recording.mp4`, dubs: { es: { id: 'private-dub', status: 'dubbed' } } });
let rows, personal, calls;
beforeEach(() => {
  rows = [pending()]; personal = true; calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url); calls.push({ address, options });
    if (!address.includes('/rest/v1/')) throw new Error('External calls forbidden in fixture');
    const path = address.split('/rest/v1/')[1];
    assert.equal(options.method || 'GET', 'GET', 'Denied access must not mutate or spend quota');
    if (path.startsWith('sessions?')) return Response.json([{ user_id: owner }]);
    if (path.startsWith('meetings?')) return Response.json(path.includes('shares=cs.') && !personal ? [] : rows);
    throw new Error('Unexpected cache/quota/provider request: ' + path);
  };
});
class Sink extends Writable {
  constructor() { super(); this.code = 200; this.headers = {}; this.parts = []; }
  _write(chunk, encoding, done) { this.parts.push(Buffer.from(chunk)); done(); }
  status(code) { this.code = code; return this; }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  json(value) { this.value = value; this.end(JSON.stringify(value)); return this; }
  text() { return Buffer.concat(this.parts).toString(); }
}
const req = (body = {}, extra = {}) => ({ method: 'POST', url: '/fixture', headers: { cookie: 'om_session=owner' }, body, ...extra });

test('pending RTMS deletion immediately removes report and transcript from the owner list but preserves other platforms', async () => {
  rows.push({ id: 'legacy', user_id: owner, status: 'done', capture_mode: 'inhouse_bot', stage_info: { deletion: 'unrelated' }, reports: { summary: 'Visible legacy' } });
  const res = new Sink(); await meetingsHandler(req({}, { method: 'GET' }), res);
  assert.equal(res.code, 200); assert.deepEqual(res.value.meetings.map(x => x.id), ['legacy']);
  assert.deepEqual(res.value.pendingDeletions, [{ id }], 'Owner retains a content-free completion handle');
  assert.doesNotMatch(res.text(), /PRIVATE_DELETION|r2:private|private-dub/);
});

test('pending RTMS deletion invalidates personal shares, public-token fallback and minting before any OTP hint or report is exposed', async () => {
  assert.equal(await resolveShareToken(token), null);
  assert.equal(await ensureShareToken(id, owner), null);
  for (const mode of [true, false]) {
    personal = mode;
    const res = new Sink(); await sharedHandler(req({}, { method: 'GET', url: '/api/shared-report?token=' + token }), res);
    assert.equal(res.code, 404); assert.equal(res.value.needOtp, undefined);
    assert.doesNotMatch(res.text(), /PRIVATE_DELETION|viewer@|private-dub/);
  }
});

test('pending RTMS deletion denies owner dub start, account diagnostics, polling and shared playback without provider calls', async () => {
  for (const action of ['start', 'status', 'account']) {
    const res = new Sink(); await dubHandler(req({ meetingId: id, lang: 'es', action }), res); assert.equal(res.code, 401);
  }
  for (const cookie of ['om_session=owner', '']) {
    const res = new Sink(); await dubHandler(req({}, { method: 'GET', url: `/api/dub?meetingId=${id}&lang=es&share=${token}`, headers: { cookie } }), res);
    assert.equal(res.code, 401);
  }
  assert.equal(calls.some(x => !x.address.includes('/rest/v1/')), false);
});

test('pending RTMS content cannot enter AI document, slides cache/quota or Ask Octo prompts', async () => {
  for (const handler of [documentHandler, slidesHandler]) {
    for (const body of [{ meetingId: id }, { meetingIds: [id] }, { shareToken: token }]) {
      const res = new Sink(); await handler(req(body), res); assert.equal(res.code, 401);
      assert.doesNotMatch(res.text(), /PRIVATE_DELETION/);
    }
  }
  const res = new Sink(); await askHandler(req({ question: 'What was discussed?' }), res);
  assert.equal(res.code, 200); assert.match(res.text(), /OCTO_REFS>>>\[\]/);
  assert.doesNotMatch(res.text(), /PRIVATE_DELETION/);
  assert.equal(calls.some(x => !x.address.includes('/rest/v1/')), false);
  const corpusQuery = calls.find(x => x.address.includes('status=eq.done'));
  assert.match(corpusQuery.address, /capture_mode,stage_info/);
});

test('UI treats a 202 erasure request as pending, not a completed deletion, for meetings and accounts', async () => {
  assert.deepEqual(pendingDeletionItems([pending(), { id }, { id: 'invalid' }]), [{ id }], 'Pending UI never receives cached report or media fields');
  for (const path of ['/api/meeting-delete', '/api/account/delete']) {
    const accepted = await requestDeletion(path, { fixture: true }, async (url, options) => {
      assert.equal(url, path); assert.equal(options.credentials, 'same-origin'); assert.equal(options.method, 'POST');
      return Response.json({ ok: true, pending: true, deletion: 'requested' }, { status: 202 });
    });
    assert.deepEqual(accepted, { pending: true });
    for (const lang of ['es', 'en']) {
      const message = deletionMessage(accepted, { lang, account: path.includes('account') });
      assert.match(message, /solicitada|requested/); assert.doesNotMatch(message, /were deleted|Se eliminaron|Reporte eliminado|Report deleted/);
    }
    assert.deepEqual(await requestDeletion(path, {}, async () => Response.json({ ok: true, pending: false })), { pending: false });
    for (const [body, status] of [[{ ok: true }, 202], [{ ok: true, pending: true }, 200], [{ ok: false }, 200], [{ error: 'private-debug' }, 503]]) {
      await assert.rejects(requestDeletion(path, {}, async () => Response.json(body, { status })), /^Error: deletion_failed$/);
    }
  }
});
