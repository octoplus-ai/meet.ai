import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchRtmsPurge, processRtmsDeletion, requestRtmsDeletion, sweepRtmsDeletions } from '../api/lib/rtms-cleanup.js';
import meetingDelete from '../api/meeting-delete.js';
import accountDelete from '../api/account/delete.js';

const user = '11111111-1111-4111-8111-111111111111', meeting = '22222222-2222-4222-8222-222222222222', session = '33333333-3333-4333-8333-333333333333';
const row = { user_id: user, meeting_id: meeting, session_id: session, stream_key: 'a'.repeat(64), purged_at: null };
const originalFetch = globalThis.fetch, priorEnv = { ...process.env };
Object.assign(process.env, { APP_URL: 'https://app.example', ZOOM_APP_ORIGINS: 'https://app.example', ZOOM_RTMS_SERVICE_URL: 'https://rtms.example', RTMS_SERVICE_SECRET: 's'.repeat(40) });
let calls, acked, native, physical;
beforeEach(() => {
  calls = []; acked = false; native = true; physical = false;
  globalThis.fetch = async (url, options = {}) => {
    const address = String(url); const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ address, method: options.method || 'GET', body });
    if (address.startsWith('https://rtms.example/v1/')) return Response.json({ ok: true, id: row.stream_key, sessionId: session, state: physical ? 'purged' : 'purging', purged: physical }, { status: physical ? 200 : 202 });
    if (!address.includes('/rest/v1/')) throw new Error('External requests forbidden');
    const path = address.split('/rest/v1/')[1];
    if (options.method === 'DELETE') return Response.json(null);
    if (path.startsWith('sessions?')) return Response.json([{ user_id: user }]);
    if (path.startsWith('app_users?')) return Response.json([{ id: user, email: 'fixture@example.invalid', plan: 'free' }]);
    if (path === 'rpc/zoom_begin_deletion') return Response.json({ ok: true, pending: acked ? 0 : 1 });
    if (path === 'rpc/zoom_ack_deletion') { acked = true; return Response.json(true); }
    if (path.startsWith('zoom_rtms_deletions?')) return Response.json(acked ? [] : [row]);
    if (path.startsWith('zoom_rtms_account_deletions?')) return Response.json([]);
    if (path.startsWith('meetings?')) return Response.json(path.includes('select=share_token') ? [] : path.includes('capture_mode=eq.zoom_rtms') && !native ? [] : [{ id: meeting, capture_mode: native ? 'zoom_rtms' : 'inhouse_bot' }]);
    if (path.startsWith('oauth_tokens?')) return Response.json([]);
    throw new Error('Unexpected fixture request: ' + path);
  };
});
after(() => { globalThis.fetch = originalFetch; process.env = priorEnv; });
const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const request = body => ({ method: 'POST', body, headers: { host: 'app.example', origin: 'https://app.example', 'content-type': 'application/json', cookie: 'om_session=fixture-session' } });

test('purge ack requires exact session/hash and physical completion, not HTTP202 or ok alone', async () => {
  for (const result of [{ ok: true }, { ok: true, purged: true, state: 'purged', id: 'b'.repeat(64), sessionId: session }, { ok: true, purged: false, state: 'purging', id: row.stream_key, sessionId: session }]) {
    assert.equal(await dispatchRtmsPurge(row, { service: async () => result }), false);
  }
  let received;
  assert.equal(await dispatchRtmsPurge(row, { service: async (path, body) => { received = { path, body }; return { ok: true, purged: true, state: 'purged', id: row.stream_key, sessionId: session }; } }), true);
  assert.deepEqual(received.body, { userId: user, meetingId: meeting, sessionId: session });
  await assert.rejects(dispatchRtmsPurge({ ...row, user_id: '../other' }), /invalid_deletion/);
});

test('durable deletion intent precedes dispatch and unavailable service never acknowledges cleanup', async () => {
  const order = [];
  const database = async path => { order.push(path); if (path === 'rpc/zoom_begin_deletion') return { ok: true, pending: 1 }; if (path.startsWith('zoom_rtms_deletions?')) return [row]; throw new Error('Unexpected mutation'); };
  const result = await requestRtmsDeletion(user, meeting, { database, dispatch: async () => { order.push('dispatch'); throw new Error('offline'); } });
  assert.equal(result.pending, true); assert.equal(order[0], 'rpc/zoom_begin_deletion'); assert(order.includes('dispatch')); assert(!order.includes('rpc/zoom_ack_deletion'));
});

test('background sweep only purges queued RTMS media and acknowledges receipts, never deletes rows or accounts', async () => {
  const operations = [];
  const database = async (path, options) => { operations.push({ path, options }); return path.startsWith('zoom_rtms_deletions?') ? [row] : true; };
  assert.deepEqual(await sweepRtmsDeletions({ database, dispatch: async () => true, limit: 1 }), { inspected: 1, purged: 1 });
  assert.equal(operations.length, 2); assert.equal(operations[1].path, 'rpc/zoom_ack_deletion'); assert(operations.every(x => x.options?.method !== 'DELETE'));
  let ack = false; assert.equal(await processRtmsDeletion(row, { database: async () => { ack = true; }, dispatch: async () => false }), false); assert.equal(ack, false);
});

test('meeting delete leaves DB intact while physical cleanup is pending and uses original deletion only after a confirmed retry', async () => {
  const pending = response(); await meetingDelete(request({ meetingId: meeting }), pending);
  assert.equal(pending.statusCode, 202); assert.equal(pending.body.pending, true); assert(!calls.some(x => x.method === 'DELETE'));
  physical = true; calls = [];
  const completed = response(); await meetingDelete(request({ meetingId: meeting }), completed);
  assert.equal(completed.statusCode, 200); assert.equal(completed.body.ok, true);
  const deletes = calls.filter(x => x.method === 'DELETE'); assert.equal(deletes.length, 2); assert(deletes.every(x => x.address.includes(meeting)));
});

test('account delete keeps session while RTMS cleanup is pending and still requires the existing exact-email confirmation', async () => {
  const wrong = response(); await accountDelete(request({ confirmEmail: 'wrong@example.invalid' }), wrong);
  assert.equal(wrong.statusCode, 400); assert(!calls.some(x => x.address.includes('zoom_begin_deletion')));
  calls = []; const pending = response(); await accountDelete(request({ confirmEmail: 'fixture@example.invalid' }), pending);
  assert.equal(pending.statusCode, 202); assert.equal(pending.body.pending, true); assert(!pending.headers['Set-Cookie']); assert(!calls.some(x => x.method === 'DELETE'));
});

test('legacy meeting deletion retains its original behavior and never dispatches RTMS purge', async () => {
  native = false; const result = response(); await meetingDelete(request({ meetingId: meeting }), result);
  assert.equal(result.statusCode, 200); assert.equal(calls.filter(x => x.method === 'DELETE').length, 2);
  assert(!calls.some(x => x.address.startsWith('https://rtms.example')));
});
