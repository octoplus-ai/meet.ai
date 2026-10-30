import test from 'node:test';
import assert from 'node:assert/strict';
import { httpsServiceOrigin } from '../api/lib/service-url.js';
import { sb } from '../api/lib/supa.js';
import { stopOrchestratorJob } from '../api/lib/orch.js';
import { getBot, getTranscript } from '../api/lib/recall.js';
import { listCalendarEvents } from '../api/lib/recall-calendar.js';

function env(t, name, value) {
  const old = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  t.after(() => { if (old === undefined) delete process.env[name]; else process.env[name] = old; });
}

test('service origins reject plaintext, URL credentials and path/query smuggling without echoing input', () => {
  for (const value of ['http://service.test', 'https://private-secret@service.test', 'https://service.test/path',
    'https://service.test?key=private-secret', 'https://service.test#private-secret', '//service.test', 'https://serv\nice.test']) {
    assert.throws(() => httpsServiceOrigin(value), error => error.code === 'invalid_service_origin' && !error.message.includes(value));
  }
  assert.equal(httpsServiceOrigin('https://service.test/'), 'https://service.test');
  assert.equal(httpsServiceOrigin(' https://service.test/\n'), 'https://service.test');
});

test('database rejects HTTP configuration before any request carrying service credentials', async t => {
  env(t, 'SUPABASE_URL', 'http://database.test');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('NO_NETWORK'); });
  await assert.rejects(sb('meetings'), { code: 'invalid_service_origin' });
  assert.equal(calls, 0);
});

test('database disables redirects and preserves conflict code without provider row or SQL details', async t => {
  env(t, 'SUPABASE_URL', 'https://database.test/');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://database.test/rest/v1/reports');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return { ok: false, status: 409, text: async () => JSON.stringify({ code: '23505', details: 'private transcript and session token', message: 'SQL row values' }) };
  });
  await assert.rejects(sb('reports', { method: 'POST', body: { title: 'fixture' } }), error => {
    assert.equal(error.code, '23505'); assert.match(error.message, /23505/);
    assert.doesNotMatch(error.message, /private|transcript|token|SQL/); return true;
  });
});

test('bot stop fails closed on HTTP and never follows an HTTPS redirect with its shared secret', async t => {
  env(t, 'BOT_ORCHESTRATOR_URL', 'http://orchestrator.test');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return { ok: true }; });
  await stopOrchestratorJob('fixture-meeting'); assert.equal(calls.length, 0);
  process.env.BOT_ORCHESTRATOR_URL = 'https://orchestrator.test/\n';
  await stopOrchestratorJob('fixture-meeting'); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://orchestrator.test/bots/stop-by-meeting');
  assert.equal(calls[0].options.redirect, 'error'); assert.ok(calls[0].options.signal);
});

test('legacy provider identity and transcript requests reject insecure URLs before fetch', async t => {
  env(t, 'RECALL_REGION_URL', 'http://recall.test');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('NO_NETWORK'); });
  await assert.rejects(getBot('fixture'), { code: 'invalid_service_origin' });
  for (const url of ['http://artifact.test/transcript', 'https://private-secret@artifact.test/transcript']) {
    await assert.rejects(getTranscript({ recordings: [{ media_shortcuts: { transcript: { data: { download_url: url } } } }] }), /RECALL_TRANSCRIPT_UNAVAILABLE/);
  }
  assert.equal(calls, 0);
});

test('legacy provider pagination cannot forward its API credential to another origin', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    calls++; assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return { ok: true, json: async () => ({ results: [], next: 'https://attacker.test/steal' }) };
  });
  await assert.rejects(listCalendarEvents('fixture-calendar'), /INVALID_RECALL_PAGE/);
  assert.equal(calls, 1);
});
