import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { usesRecall, hasCompleteReport, meetingStateFilter, stalledNativeProcessing } from '../api/lib/processing-state.js';
import { createReprocessHandler, config } from '../api/reprocess-stale.js';
import { analyzeTranscript, processMeeting, ANALYSIS_VERSION } from '../api/lib/process.js';
import { getBot, getTranscript } from '../api/lib/recall.js';
import { recallRecoveryEligible } from '../api/lib/recall-recovery.js';

const priorKey = process.env.ANTHROPIC_API_KEY, originalFetch = globalThis.fetch;
process.env.ANTHROPIC_API_KEY = 'offline-fixture';
after(() => { globalThis.fetch = originalFetch; if (priorKey == null) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = priorKey; });
const clone = value => JSON.parse(JSON.stringify(value));
const response = () => ({ code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const request = () => ({ method: 'POST', headers: { cookie: 'om_session=fixture' } });
const report = () => ({ id: 'report', summary: 'A real saved summary.', transcript: '[0:00] Person: This synthetic captured transcript is long enough for a real analysis.', report_version: 7 });
const meeting = (extra = {}) => ({ id: 'meeting', user_id: 'owner', bot_id: 'native-job', capture_mode: 'inhouse_bot', status: 'processing', status_synced_at: '2020-01-01T00:00:00Z', stage_info: {}, reports: [], ...extra });
const listingSource = (await readFile(new URL('../api/meetings.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export const config', 'const config').replace('export default async function handler', 'async function handler');

function matches(row, params) {
  for (const key of ['id', 'user_id', 'status', 'status_synced_at', 'stage_info']) {
    const condition = params.get(key); if (!condition) continue;
    if (condition === 'is.null') { if (row[key] != null) return false; continue; }
    if (!condition.startsWith('eq.')) continue;
    const expected = condition.slice(3);
    if (key === 'stage_info' ? JSON.stringify(row[key]) !== JSON.stringify(JSON.parse(expected)) : String(row[key]) !== expected) return false;
  }
  return true;
}

async function listing(rows, beforePatch) {
  const writes = [], recall = [];
  const db = rows.map(clone);
  const context = vm.createContext({ Date, encodeURIComponent, usesRecall, hasCompleteReport, meetingStateFilter, stalledNativeProcessing,
    process: { env: { RECALL_API_KEY: 'offline' } }, console: { error() {} }, parseCookies: () => ({ om_session: 'fixture' }),
    serializeRtmsMedia: row => row, serializeLegacyMedia: row => row, isRtmsDeleting: row => row.capture_mode === 'zoom_rtms' && !!row.stage_info?.deletion,
    getEventAttendees: async () => { throw new Error('Unexpected Calendar request'); },
    getBot: async id => { recall.push(id); return null; }, latestCode() {}, mapStatus() {},
    sb: async (path, options = {}) => {
      if (path.startsWith('sessions?')) return [{ user_id: 'owner' }];
      assert.ok(path.startsWith('meetings?'));
      const params = new URLSearchParams(path.split('?')[1]);
      if (options.method === 'PATCH') { beforePatch?.(db); const matching = db.filter(row => matches(row, params)); writes.push({ path, body: clone(options.body), matched: matching.length }); for (const row of matching) Object.assign(row, clone(options.body)); return matching.map(clone); }
      return db.filter(row => matches(row, params)).map(clone);
    },
  });
  vm.runInContext(listingSource, context); const res = response();
  await context.handler({ headers: {} }, res);
  return { db, writes, recall, res };
}

test('old native processing without a delivered report becomes an explicit recoverable failure', async () => {
  const source = meeting({ recording_url: 'r2:private/owner/meeting/recording.mp4', stage_info: { recovery: { preserved: true } } });
  const f = await listing([source]);
  assert.equal(f.res.code, 200); assert.equal(f.db[0].status, 'error'); assert.equal(f.db[0].error, 'PROCESSING_STALLED');
  assert.equal(f.db[0].recording_url, source.recording_url); assert.deepEqual(f.db[0].stage_info, source.stage_info); assert.deepEqual(f.recall, []);
});

test('listing finalizes only actual saved reports and never generates AI or mixes provider ids', async () => {
  const now = new Date().toISOString();
  const rows = [meeting({ id: 'ready', reports: report() }), meeting({ id: 'live', status_synced_at: now }),
    meeting({ id: 'blank', status_synced_at: now, reports: { summary: '', transcript: 'real captured content' } }),
    meeting({ id: 'rtms', capture_mode: 'zoom_rtms' }), meeting({ id: 'media', capture_mode: 'media_api' }),
    meeting({ id: 'recall', capture_mode: null, bot_id: 'recall-bot', status_synced_at: now })];
  const f = await listing(rows);
  assert.equal(f.db.find(row => row.id === 'ready').status, 'done');
  for (const id of ['live','blank','rtms','media','recall']) assert.equal(f.db.find(row => row.id === id).status, 'processing');
  assert.deepEqual(f.recall, ['recall-bot']);
});

test('a concurrent worker heartbeat or completed callback defeats stale-state CAS', async () => {
  for (const status of ['recording', 'done']) {
    const f = await listing([meeting()], rows => { rows[0].status = status; rows[0].status_synced_at = new Date().toISOString(); });
    assert.equal(f.db[0].status, status); assert.equal(f.writes[0].matched, 0);
  }
});

test('native captures cannot be reprocessed through Recall even with force enabled', async () => {
  globalThis.fetch = async () => { throw new Error('Unexpected network'); };
  for (const capture_mode of ['inhouse_bot','media_api','zoom_rtms']) assert.equal((await processMeeting(meeting({ capture_mode }), { force: true })).skipped, 'not a Recall capture');
});

function reprocessFixture({ analyze, rows = [meeting({ status: 'done', reports: report() })] } = {}) {
  const db = rows.map(clone); let time = Date.now(), calls = 0, leases = 0;
  const database = async (path, options = {}) => {
    if (path.startsWith('sessions?')) return [{ user_id: 'owner' }];
    assert.ok(path.startsWith('meetings?')); const params = new URLSearchParams(path.split('?')[1]);
    assert.equal(params.get('user_id'), 'eq.owner');
    const found = db.filter(row => matches(row, params));
    if (options.method === 'PATCH') for (const row of found) Object.assign(row, clone(options.body));
    return found.map(clone);
  };
  const runAnalysis = async (row, options) => { calls++; assert.equal(options.timeoutMs, 180000); return analyze ? analyze(row, options, db) : { ok: true }; };
  const handler = createReprocessHandler({ database, analyze: runAnalysis, now: () => time, makeLease: () => `lease-${++leases}`, validateOrigin: () => true });
  return { db, get calls() { return calls; }, advance: ms => { time += ms; }, async run() { const res = response(); await handler(request(), res); return res; } };
}

test('one request processes one report within the expanded function budget', async () => {
  assert.equal(config.maxDuration, 300);
  const f = reprocessFixture({ rows: [meeting({ id: 'one', status: 'done', reports: report() }), meeting({ id: 'two', status: 'done', reports: report() })] });
  const res = await f.run(); assert.equal(f.calls, 1); assert.equal(res.body.updated, 1); assert.equal(res.body.remaining, 1);
});

test('concurrent requests share a durable CAS lease; later metadata changes invalidate the save', async () => {
  let resolve, started; const entered = new Promise(r => { started = r; });
  const f = reprocessFixture({ analyze: async (_row, options, db) => { started(); await new Promise(r => { resolve = r; }); db[0].stage_info.reportAnalysis.lease = 'replacement'; assert.equal(await options.beforeSave(), false); return { skipped: 'analysis lease changed' }; } });
  const first = f.run(); await entered; const second = await f.run();
  assert.equal(second.body.pending, true); assert.equal(f.calls, 1); resolve(); await first;
  assert.equal(f.db[0].stage_info.reportAnalysis.lease, 'replacement');
});

test('provider failures preserve the existing report and stop automatic retries after three attempts', async () => {
  const f = reprocessFixture({ analyze: async () => { throw new Error('synthetic provider failure'); } });
  const original = clone(f.db[0].reports);
  for (let i = 0; i < 3; i++) {
    assert.equal((await f.run()).body.failed, 1); assert.deepEqual(f.db[0].reports, original);
    assert.equal((await f.run()).body.updated, 0); assert.equal(f.calls, i + 1); f.advance(16 * 60000);
  }
  assert.equal((await f.run()).body.failed, 1); assert.equal(f.calls, 3);
});

test('reprocessing requires POST and a same-origin request before reading private data', async () => {
  const handler = createReprocessHandler({ database: async () => { throw new Error('Unexpected database'); }, validateOrigin: () => false });
  let res = response(); await handler({ ...request(), method: 'GET' }, res); assert.equal(res.code, 405);
  res = response(); await handler(request(), res); assert.equal(res.code, 403);
});

test('analysis attaches a bounded abort signal and rejects provider HTTP failures without response content', async () => {
  let signal;
  globalThis.fetch = async (_url, options) => { signal = options.signal; return { ok: false, status: 429, json: async () => { throw new Error('Private body must not be parsed'); } }; };
  await assert.rejects(analyzeTranscript('Synthetic captured information', 'Fixture', [], { timeoutMs: 100 }), /ANALYSIS_PROVIDER_UNAVAILABLE/);
  assert.ok(signal instanceof AbortSignal);
});

test('a stalled analysis request aborts instead of exhausting the function time limit', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  globalThis.fetch = async (_url, options) => new Promise((_, reject) => { options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }); });
  try { await assert.rejects(analyzeTranscript('Synthetic transcript', 'Fixture', [], { timeoutMs: 5 }), error => error.name === 'TimeoutError'); }
  finally { clearTimeout(keepAlive); }
});

test('provider failures are retryable errors, never evidence of an empty captured meeting', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(getBot('fixture'), /RECALL_PROVIDER_UNAVAILABLE/);
  await assert.rejects(getTranscript({ recordings: [{ media_shortcuts: { transcript: { data: { download_url: 'https://fixture.invalid/artifact' } } } }] }), /RECALL_TRANSCRIPT_UNAVAILABLE/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ recordings: [{ media_shortcuts: {} }] }) });
  assert.equal((await processMeeting(meeting({ capture_mode: null }))).skipped, 'transcript not ready');
});

test('stored analysis compares source hashes in memory without putting transcript content in URL filters', async () => {
  const source = (await readFile(new URL('../api/lib/process.js', import.meta.url), 'utf8')).split('export async function reanalyzeStored')[1];
  for (const changed of [false, true]) {
    const original = { ...report(), transcript: 'Private fixture text. '.repeat(5000), participants: [], coaching: {} };
    const paths = []; let reads = 0, patches = 0;
    const context = vm.createContext({ createHash, encodeURIComponent, ANALYSIS_VERSION, partialCaptureSummary: x => x,
      analyzeTranscript: async () => ({ summary: 'New grounded report', scores: {} }), assignTimestamps() {}, parseStoredTurns: () => [],
      sanitizeSpeakerMap: () => ({}), normalizeStoredTranscript: text => text, preserveCameraMetadata: () => ({}),
      sb: async (path, options = {}) => { paths.push(path); if (options.method === 'PATCH') { patches++; return [{ ...original, ...options.body }]; } reads++; return [{ ...original, ...(changed && reads > 1 ? { summary: 'Concurrent manual edit' } : {}) }]; },
    });
    vm.runInContext('async function reanalyzeStored' + source, context);
    const result = await context.reanalyzeStored(meeting({ status: 'done' }), { beforeSave: async () => true });
    assert.equal(patches, changed ? 0 : 1); assert.equal(changed ? result.skipped : result.ok, changed ? 'report changed' : true);
    for (const path of paths) { assert.ok(path.length < 300); assert.doesNotMatch(path, /Private|transcript=eq/); }
  }
});

test('explicit Recall recovery stays available in POST, is scoped to Recall, and processes at most one meeting', async () => {
  const source = (await readFile(new URL('../api/recall/reprocess.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace('export const config', 'const config').replace('export default async function handler', 'async function handler');
  const rows = [meeting(), meeting({ id: 'recall-one', capture_mode: null }), meeting({ id: 'recall-two', capture_mode: 'recall' })], calls = [];
  const context = vm.createContext({ Date, encodeURIComponent, usesRecall, recallRecoveryEligible, parseCookies: () => ({ om_session: 'fixture' }), zoomRequestOrigin: () => 'https://fixture.invalid',
    sb: async path => path.startsWith('sessions?') ? [{ user_id: 'owner' }] : rows,
    recoverRecallMeeting: async row => { calls.push(row.id); return { ok: true, state: 'complete' }; },
  });
  vm.runInContext(source, context); const res = response();
  await context.handler({ method: 'POST', headers: { origin: 'https://fixture.invalid' }, body: {} }, res);
  assert.equal(res.code, 200); assert.deepEqual(calls, ['recall-one']); assert.equal(res.body.remaining, 1);
});
