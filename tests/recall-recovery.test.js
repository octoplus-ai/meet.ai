import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRecallRecovery, recallRecoveryEligible } from '../api/lib/recall-recovery.js';
import { usesRecall } from '../api/lib/processing-state.js';

const clone = value => JSON.parse(JSON.stringify(value));
const meeting = () => ({ id: 'meeting', user_id: 'owner', bot_id: 'recall-bot', capture_mode: null, status: 'processing', stage_info: { retained: true }, reports: [] });
function fixture(process) {
  const row = meeting(); let time = Date.now(), calls = 0, leases = 0;
  const database = async (path, options = {}) => {
    const params = new URLSearchParams(path.split('?')[1]);
    for (const key of ['id', 'user_id', 'bot_id', 'capture_mode', 'status', 'stage_info']) {
      const filter = params.get(key); if (!filter) continue;
      if (filter === 'is.null') { if (row[key] != null) return []; }
      else if (key === 'stage_info') { if (JSON.stringify(row[key]) !== JSON.stringify(JSON.parse(filter.slice(3)))) return []; }
      else if (String(row[key]) !== filter.slice(3)) return [];
    }
    if (options.method === 'PATCH') Object.assign(row, clone(options.body));
    return [clone(row)];
  };
  const recover = createRecallRecovery({ database, now: () => time, makeLease: () => `lease-${++leases}`,
    process: async (...args) => { calls++; return process ? process(row, ...args) : { ok: true }; } });
  return { row, recover: options => recover(clone(row), options), get calls() { return calls; }, advance: ms => { time += ms; } };
}

test('webhook and automatic POST share one claim and preserve unrelated concurrent metadata', async () => {
  let release, entered; const started = new Promise(resolve => { entered = resolve; });
  const f = fixture(async row => { entered(); await new Promise(resolve => { release = resolve; }); row.stage_info.metadata = 'concurrent'; return { ok: true }; });
  const first = f.recover({ transcriptEvent: true }); await started;
  assert.equal((await f.recover()).state, 'pending'); assert.equal(f.calls, 1);
  release(); assert.equal((await first).state, 'complete');
  assert.equal(f.row.stage_info.metadata, 'concurrent'); assert.equal(f.row.stage_info.retained, true);
  assert.equal(f.row.stage_info.recallRecovery.state, 'complete');
});

test('failed recovery has durable cooldown and stops after three provider attempts', async () => {
  const f = fixture(async () => { throw new Error('private provider failure'); });
  for (let i = 0; i < 3; i++) {
    const failed = await f.recover(); assert.equal(failed.state, 'failed'); assert.equal(failed.error, 'RECALL_PROCESSING_UNAVAILABLE');
    assert.equal(f.calls, i + 1);
    assert.equal((await f.recover()).state, i === 2 ? 'limited' : 'pending');
    f.advance(16 * 60000);
  }
  assert.equal((await f.recover()).state, 'limited'); assert.equal(f.calls, 3);
});

test('pending transcript is retryable and a replacement lease cannot be released by an old worker', async () => {
  const f = fixture(async row => { row.stage_info.recallRecovery.lease = 'replacement'; return { skipped: 'transcript not ready' }; });
  const result = await f.recover({ transcriptEvent: true });
  assert.equal(result.state, 'failed'); assert.equal(result.error, 'RECALL_TRANSCRIPT_PENDING'); assert.equal(result.retryAfter, 60);
  assert.equal(f.row.stage_info.recallRecovery.lease, 'replacement');
});

test('repeated transcript readiness delays do not exhaust the later AI processing budget', async () => {
  let checks = 0, generated = 0;
  const f = fixture(async () => { checks++; if (checks <= 8) return { skipped: 'transcript not ready' }; generated++; return { ok: true }; });
  for (let i = 0; i < 8; i++) {
    assert.equal((await f.recover({ transcriptEvent: true })).error, 'RECALL_TRANSCRIPT_PENDING');
    assert.equal(f.row.stage_info.recallRecovery.attempts, 0);
    assert.equal((await f.recover()).state, 'pending');
    f.advance(61000);
  }
  assert.equal((await f.recover({ transcriptEvent: true })).state, 'complete');
  assert.equal(f.row.stage_info.recallRecovery.attempts, 1); assert.equal(generated, 1);
});

test('automatic recovery excludes native providers, active capture, complete reports and exhausted jobs', async () => {
  assert.equal(recallRecoveryEligible(meeting()), true);
  for (const update of [{ capture_mode: 'inhouse_bot' }, { capture_mode: 'zoom_rtms' }, { status: 'recording' },
    { status: 'done', reports: { summary: 'Completed', transcript: 'Captured' } },
    { stage_info: { recallRecovery: { botId: 'recall-bot', attempts: 3 } } }]) assert.equal(recallRecoveryEligible({ ...meeting(), ...update }), false);
  const f = fixture(); f.row.status = 'done'; f.row.reports = { summary: 'Complete', transcript: 'Captured' };
  assert.equal((await f.recover()).skipped, 'already done'); assert.equal(f.calls, 0);
  f.row.capture_mode = 'inhouse_bot'; assert.equal((await f.recover({ force: true })).state, 'skipped'); assert.equal(f.calls, 0);
});

test('transcript webhook returns a retryable HTTP response until actual processing succeeds', async () => {
  const source = (await readFile(new URL('../api/recall/webhook.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace('export const config', 'const config').replace('export default async function handler', 'async function handler');
  for (const state of ['pending', 'failed', 'limited', 'complete']) {
    const context = vm.createContext({ URL, encodeURIComponent, usesRecall, process: { env: { RECALL_WEBHOOK_SECRET: 'fixture' } }, console: { error() {} },
      sb: async () => [meeting()], mapStatus() {}, recoverRecallMeeting: async () => ({ state, retryAfter: 60, ...(state === 'complete' ? { ok: true } : {}) }),
    });
    vm.runInContext(source, context);
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } };
    await context.handler({ method: 'POST', url: '/api/recall/webhook?key=fixture', body: { event: 'transcript.done', data: { bot_id: 'recall-bot' } } }, res);
    assert.equal(res.code, state === 'complete' ? 200 : 503);
    if (state !== 'complete') assert.equal(res.headers['Retry-After'], '60');
  }
});

test('webhook rejects untrusted methods, missing configuration, invalid secrets and malformed bot IDs before database work', async () => {
  const source = (await readFile(new URL('../api/recall/webhook.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace('export const config', 'const config').replace('export default async function handler', 'async function handler');
  for (const fixture of [
    { method: 'GET', secret: 'fixture', key: 'fixture', botId: 'recall-bot', expected: 405 },
    { secret: '', key: 'fixture', botId: 'recall-bot', expected: 503 },
    { secret: 'fixture', key: 'wrong', botId: 'recall-bot', expected: 401 },
    ...[{}, 0, false, 'x'.repeat(129), ''].map(botId => ({ secret: 'fixture', key: 'fixture', botId, expected: 400 })),
  ]) {
    let reads = 0;
    const context = vm.createContext({ URL, encodeURIComponent, usesRecall, process: { env: { RECALL_WEBHOOK_SECRET: fixture.secret } }, console: { error() {} },
      sb: async () => { reads++; throw Error('Unexpected private read'); }, mapStatus() {}, recoverRecallMeeting() { throw Error('Unexpected provider call'); },
    });
    vm.runInContext(source, context);
    const res = { code: 200, setHeader() {}, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } };
    await context.handler({ method: fixture.method || 'POST', url: `/api/recall/webhook?key=${fixture.key}`, body: { event: 'transcript.done', data: { bot_id: fixture.botId } } }, res);
    assert.equal(res.code, fixture.expected); assert.equal(reads, 0);
  }
});

test('webhook scopes encoded bot IDs and never mutates native, cancelled or concurrently cancelled captures', async () => {
  const source = (await readFile(new URL('../api/recall/webhook.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace('export const config', 'const config').replace('export default async function handler', 'async function handler');
  const botId = 'id&status=neq.done';
  for (const event of ['transcript.done', 'bot.in_call_recording']) {
    for (const row of [{ ...meeting(), bot_id: botId, capture_mode: 'inhouse_bot' }, { ...meeting(), bot_id: botId, capture_mode: 'zoom_rtms' }, { ...meeting(), bot_id: botId, status: 'skipped' }]) {
      const paths = []; let calls = 0;
      const context = vm.createContext({ URL, encodeURIComponent, usesRecall, process: { env: { RECALL_WEBHOOK_SECRET: 'fixture' } }, console: { error() {} },
        sb: async (path, options = {}) => { paths.push(path); assert.notEqual(options.method, 'PATCH'); return [row]; }, mapStatus: () => 'recording', recoverRecallMeeting: () => { calls++; },
      });
      vm.runInContext(source, context);
      const res = { setHeader() {}, status() { return this; }, json(v) { this.body = v; return this; } };
      await context.handler({ method: 'POST', url: '/api/recall/webhook?key=fixture', body: { event, data: { bot_id: botId } } }, res);
      assert.equal(paths.length, 1); assert.equal(paths[0], `meetings?bot_id=eq.${encodeURIComponent(botId)}&select=*`); assert.equal(calls, 0); assert.equal(res.body.ignored, true);
    }
  }
  const context = vm.createContext({ URL, encodeURIComponent, usesRecall, process: { env: { RECALL_WEBHOOK_SECRET: 'fixture' } }, console: { error() {} },
    sb: async (path, options = {}) => {
      if (options.method === 'PATCH') { assert.match(path, /status=not.in.\(done,skipped\)/); assert.match(path, /capture_mode.is.null,capture_mode.eq.recall/); return []; }
      return [meeting()];
    }, mapStatus: () => 'recording', recoverRecallMeeting() { throw Error('Unexpected generation'); },
  });
  vm.runInContext(source, context);
  const res = { setHeader() {}, status() { return this; }, json(v) { this.body = v; return this; } };
  await context.handler({ method: 'POST', url: '/api/recall/webhook?key=fixture', body: { event: 'bot.in_call_recording', data: { bot_id: 'recall-bot' } } }, res);
  assert.equal(res.body.ignored, true);
});
