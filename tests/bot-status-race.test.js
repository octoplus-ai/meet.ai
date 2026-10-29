// Exercise the real status and event-toggle handlers against an in-memory REST boundary.
// No production database, orchestrator or calendar requests are made.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseMeetingUrl, enabledPlatforms } from '../shared/meeting-platform.js';

const source = name => fs.readFileSync(new URL(`../api/${name}`, import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace(/\bexport default /g, '');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
const meeting = (status = 'joining', extra = {}) => ({
  id: 'meeting-1', bot_id: 'bot-1', user_id: 'member', calendar_event_id: 'event-1', status,
  title: 'Zoom test', meeting_url: 'https://zoom.us/j/12345678901',
  start_time: '2026-10-29T14:50:00Z', status_synced_at: '2026-10-29T14:50:01Z', ...extra,
});

function fixture({ rows = [meeting()], beforePatch, onStop } = {}) {
  const stored = rows.map(row => ({ ...row })), queries = [], mutations = [], schedules = [];
  let patchHook = beforePatch;
  const matches = (row, params) => [...params].every(([key, expression]) => {
    if (['select', 'order', 'limit'].includes(key)) return true;
    if (expression.startsWith('eq.')) return String(row[key]) === expression.slice(3);
    if (expression.startsWith('not.in.(')) return !expression.slice(8, -1).split(',').includes(row[key]);
    throw new Error(`Unsupported fixture filter: ${key}=${expression}`);
  });
  const sb = async (query, request = {}) => {
    queries.push({ query, request });
    const [table, search] = query.split('?'), params = new URLSearchParams(search);
    if (table === 'sessions') return [{ user_id: 'member' }];
    if (table === 'app_users') return [{ id: 'member', notetaker_name: 'OctoMeet AI' }];
    assert.equal(table, 'meetings');
    if (request.method === 'PATCH' && patchHook) { const hook = patchHook; patchHook = null; await hook(stored); }
    const selected = stored.filter(row => matches(row, params));
    if (request.method === 'PATCH') {
      for (const row of selected) { Object.assign(row, request.body); mutations.push({ id: row.id, body: { ...request.body } }); }
      return request.prefer === 'return=representation' ? selected.map(row => ({ ...row })) : null;
    }
    if (request.method === 'DELETE') {
      for (const row of selected) stored.splice(stored.indexOf(row), 1);
      return null;
    }
    return selected.map(row => ({ ...row }));
  };
  const invoke = async (name, req) => {
    const context = vm.createContext({
      Date, URL, encodeURIComponent, parseMeetingUrl, enabledPlatforms, sb,
      process: { env: { BOT_INGEST_SECRET: 'fixture-secret', BOT_ORCHESTRATOR_URL: 'https://orchestrator.example.test', BOT_ENABLED_PLATFORMS: 'google_meet,zoom,teams' } },
      console: { error() {} }, parseCookies: () => ({ om_session: 'fixture-session' }),
      resolveZoomCaptureRoute: async () => ({ mode: 'browser' }),
      listUpcomingEvents: async () => ({ events: [{ id: 'event-1', title: 'Zoom test', meetingUrl: 'https://zoom.us/j/12345678901', start: '2026-10-29T14:50:00Z' }] }),
      ensureShareToken: async () => { throw new Error('Unexpected share token request'); },
      stopOrchestratorJob: async id => { if (onStop) await onStop(id, api); },
      scheduleBot: async (uid, options) => {
        assert.equal(uid, 'member'); schedules.push(options);
        stored.push(meeting('scheduled', { id: 'meeting-new', bot_id: 'bot-new' }));
        return { ok: true };
      },
    });
    vm.runInContext(source(name), context);
    const res = response(); await context.handler(req, res); return res;
  };
  const api = {
    stored, queries, mutations, schedules,
    status: (body = {}, headers = {}) => invoke('bot/status.js', { method: 'POST', headers, body: { secret: 'fixture-secret', meetingId: 'meeting-1', status: 'joining', ...body } }),
    toggle: enable => invoke('event-bot.js', { method: 'POST', url: '/api/event-bot', headers: {}, body: { eventId: 'event-1', enable } }),
  };
  return api;
}

test('late callbacks cannot change a canceled or completed meeting or its saved media', async () => {
  for (const terminal of ['skipped', 'done']) for (const incoming of ['joining', 'recording', 'processing', 'error']) {
    const original = meeting(terminal, { recording_url: 'https://media.example.test/saved.mp4' });
    const f = fixture({ rows: [original] });
    const res = await f.status({ status: incoming, error: 'late worker error', recordingUrl: 'https://media.example.test/stale.mp4' });
    assert.equal(res.code, 200); assert.equal(res.body.ok, true); assert.ok(res.body.skipped);
    assert.deepEqual(f.stored[0], original); assert.equal(f.mutations.length, 0);
  }
});

test('cancellation or completion between the status read and update wins atomically', async () => {
  for (const terminal of ['skipped', 'done']) for (const incoming of ['joining', 'error']) {
    const f = fixture({ beforePatch: rows => { rows[0].status = terminal; rows[0].status_synced_at = '2026-10-29T15:11:00Z'; } });
    const res = await f.status({ status: incoming, error: 'late worker error' });
    assert.equal(res.code, 200); assert.equal(res.body.ok, true); assert.ok(res.body.skipped);
    assert.equal(res.body.status, undefined, 'An ignored callback must not claim its status was saved');
    assert.equal(f.stored[0].status, terminal); assert.equal(f.stored[0].status_synced_at, '2026-10-29T15:11:00Z');
    assert.equal(f.mutations.length, 0);
  }
});

test('ordinary recording transitions retain early media recovery and update only their meeting', async () => {
  const other = meeting('recording', { id: 'meeting-2', bot_id: 'bot-2' });
  const f = fixture({ rows: [meeting(), other] });
  for (const status of ['in_call', 'recording', 'processing']) {
    const res = await f.status({ status, ...(status === 'processing' ? { recordingUrl: 'https://media.example.test/recording.mp4' } : {}) });
    assert.equal(res.code, 200); assert.equal(res.body.status, status); assert.equal(res.body.skipped, undefined);
    assert.equal(f.stored[0].status, status);
  }
  await f.status({ status: 'error', error: 'transcription unavailable' });
  assert.equal(f.stored[0].recording_url, 'https://media.example.test/recording.mp4');
  assert.equal(f.stored[0].error, 'transcription unavailable');
  assert.deepEqual(f.stored[1], other);
});

test('bot-id callbacks remain scoped to the resolved meeting', async () => {
  const f = fixture({ rows: [meeting(), meeting('joining', { id: 'meeting-2', bot_id: 'bot-2' })] });
  const res = await f.status({ meetingId: undefined, botId: 'bot-2', status: 'recording' });
  assert.equal(res.body.status, 'recording'); assert.equal(f.stored[0].status, 'joining'); assert.equal(f.stored[1].status, 'recording');
});

test('deletion during a callback does not claim the missing meeting was updated', async () => {
  const f = fixture({ beforePatch: rows => { rows.length = 0; } });
  const res = await f.status();
  assert.equal(res.code, 200); assert.ok(res.body.skipped); assert.equal(res.body.status, undefined); assert.equal(f.mutations.length, 0);
});

test('disable, late worker callback, and enable dispatch a fresh job', async () => {
  let late;
  const f = fixture({ onStop: async (id, api) => { assert.equal(id, 'meeting-1'); late = await api.status({ status: 'joining' }); } });
  const disabled = await f.toggle(false);
  assert.equal(disabled.body.enabled, false); assert.ok(late.body.skipped); assert.equal(f.stored[0].status, 'skipped');
  const enabled = await f.toggle(true);
  assert.equal(enabled.body.enabled, true); assert.equal(f.schedules.length, 1); assert.equal(f.schedules[0].manualRetry, true);
  assert.equal(f.stored[0].id, 'meeting-new'); assert.equal(f.stored[0].status, 'scheduled');
  const stale = await f.status({ status: 'error', error: 'old worker failed' });
  assert.equal(stale.code, 404); assert.equal(f.stored[0].status, 'scheduled');
});

test('unauthorized and unsupported callbacks never query or mutate meetings', async () => {
  const f = fixture();
  assert.equal((await f.status({ secret: 'wrong' })).code, 401);
  assert.equal((await f.status({ status: 'done' })).code, 400);
  assert.equal(f.queries.length, 0); assert.equal(f.mutations.length, 0);
  assert.equal((await f.status({ meetingId: 'unknown' })).code, 404);
});
