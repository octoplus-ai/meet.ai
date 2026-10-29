// Real handlers with database, calendar and scheduler boundaries held in memory.
// No browser, Google request, meeting or orchestrator is used by this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { extractMeetingUrl, parseMeetingUrl, enabledPlatforms } from '../shared/meeting-platform.js';

const source = name => fs.readFileSync(new URL(`../api/${name}`, import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?;\r?\n/gm, '').replace(/\bexport default /g, '')
  .replace(/\bexport (?=(?:async )?function|const)/g, '');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
const urls = {
  google_meet: 'https://meet.google.com/abc-defg-hij',
  zoom: 'https://zoom.us/j/12345678901?pwd=fixture-only',
  teams: 'https://teams.microsoft.com/meet/1234567890123?p=fixture-only',
};
const start = new Date(Date.now() + 60 * 60000).toISOString();
const end = new Date(Date.now() + 90 * 60000).toISOString();
const event = (id = 'event-1', meetingUrl = urls.google_meet) => ({
  id, title: `Meeting ${id}`, meetingUrl, start, end, attendees: 2,
  organizer: 'host@external.example.test', status: 'confirmed', selfDeclined: false,
});
const row = (status = 'scheduled', extra = {}) => ({
  id: 'meeting-1', user_id: 'member', calendar_event_id: 'event-1', status,
  title: 'Meeting event-1', meeting_url: urls.google_meet, start_time: start, ...extra,
});
const invite = (id, meetingUrl, extra = {}) => ({
  id, summary: `Invitation ${id}`, status: 'confirmed', start: { dateTime: start }, end: { dateTime: end },
  organizer: { email: 'host@external.example.test', self: false },
  attendees: [{ email: 'member@example.test', self: true, responseStatus: 'needsAction' }],
  location: meetingUrl, ...extra,
});

function fixture({ events = [event()], rows = [], autoJoin = true, env = {}, scheduleResult = { ok: true }, calendarItems } = {}) {
  const stored = rows.map(item => ({ ...item })), queries = [], mutations = [], schedules = [], http = [], errors = [];
  const context = vm.createContext({
    Date, URL, URLSearchParams, encodeURIComponent, parseMeetingUrl, enabledPlatforms, extractMeetingUrl,
    process: { env: { BOT_ORCHESTRATOR_URL: 'https://orchestrator.example.test', BOT_ENABLED_PLATFORMS: 'google_meet,zoom,teams', ...env } },
    console: { error: (...args) => errors.push(args), warn() {}, log() {} },
    parseCookies: () => ({ om_session: 'fixture-session' }),
    listUpcomingEvents: async uid => { assert.equal(uid, 'member'); return { events }; },
    ensureShareToken: async () => 'fixture-share',
    stopOrchestratorJob: async () => {},
    scheduleBot: async (uid, options) => {
      assert.equal(uid, 'member'); schedules.push({ uid, options, rowsAtDispatch: stored.map(item => ({ ...item })) });
      return scheduleResult;
    },
    sb: async (query, request = {}) => {
      queries.push({ query, request });
      const table = query.split('?')[0], params = new URLSearchParams(query.split('?')[1]);
      const equal = name => params.get(name)?.replace(/^eq\./, '');
      if (request.method && request.method !== 'GET') {
        mutations.push({ query, request });
        assert.equal(table, 'meetings', 'Only meeting mutations are expected in these fixtures');
        if (request.method === 'DELETE') {
          const index = stored.findIndex(item => item.id === equal('id'));
          if (index >= 0) stored.splice(index, 1);
          return [];
        }
        if (request.method === 'PATCH') {
          const found = stored.find(item => item.id === equal('id'));
          assert.ok(found); Object.assign(found, request.body); return [found];
        }
        if (request.method === 'POST') { const created = { id: 'new-meeting', ...request.body }; stored.push(created); return [created]; }
        throw new Error(`Unexpected mutation ${request.method}`);
      }
      if (table === 'sessions') return [{ user_id: 'member' }];
      if (table === 'app_users') return [{ id: 'member', auto_join: autoJoin, notetaker_name: 'Member bot' }];
      if (table === 'oauth_tokens') return [{ access_token: 'fixture-token', expiry: '2099-01-01' }];
      if (table === 'reports') return [];
      if (table === 'meetings') {
        assert.equal(equal('user_id'), 'member', 'Meeting state must be scoped to the authenticated user');
        const filter = params.get('calendar_event_id');
        if (filter?.startsWith('eq.')) return stored.filter(item => item.calendar_event_id === filter.slice(3));
        if (filter?.startsWith('in.(')) {
          const ids = filter.slice(4, -1).split(',').map(id => id.replace(/^"|"$/g, ''));
          return stored.filter(item => ids.includes(item.calendar_event_id));
        }
        return stored;
      }
      throw new Error(`Unexpected DB query: ${query}`);
    },
    fetch: async (input, options = {}) => {
      const url = new URL(input); http.push(url);
      assert.equal(url.origin, 'https://www.googleapis.com');
      assert.equal(url.pathname, '/calendar/v3/calendars/primary/events');
      assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      return { json: async () => ({ items: calendarItems || [] }) };
    },
  });
  return {
    stored, queries, mutations, schedules, http, errors,
    async call(name = 'event-bot.js', { method = 'GET', eventId = 'event-1', enable = true } = {}) {
      vm.runInContext(source(name), context);
      const res = response();
      await context.handler({ method, url: `/api/event-bot?eventId=${encodeURIComponent(eventId)}`, headers: {}, body: { eventId, enable } }, res);
      return res;
    },
  };
}

function assertAvailability(body, available, reason, eligible) {
  assert.equal(body.botAvailable, available);
  assert.equal(body.botUnavailableReason, reason);
  assert.equal(body.autoJoinEligible, eligible);
}

test('an unlinked event is never enabled merely because auto-join is on or default-on', async () => {
  for (const autoJoin of [true, null, false]) {
    const f = fixture({ autoJoin });
    const res = await f.call();
    assert.equal(res.code, 200); assert.equal(res.body.linked, false); assert.equal(res.body.enabled, false);
    assertAvailability(res.body, true, null, autoJoin !== false);
    assert.equal(f.schedules.length, 0); assert.equal(f.mutations.length, 0);
  }
});

const unavailable = [
  { label: 'missing link', meetingUrl: null, reason: 'no_meeting_link', codes: [400, 409] },
  { label: 'invalid link', meetingUrl: 'https://meet.google.com/not-a-meeting', reason: 'invalid_meeting_url', codes: [400] },
  { label: 'unsupported host', meetingUrl: 'https://example.test/meeting', reason: 'invalid_meeting_url', codes: [400] },
  { label: 'platform gate', meetingUrl: urls.teams, env: { BOT_ENABLED_PLATFORMS: 'google_meet,zoom' }, reason: 'platform_disabled', codes: [409] },
  { label: 'missing backend', meetingUrl: urls.zoom, env: { BOT_ORCHESTRATOR_URL: '' }, reason: 'bot_backend_unavailable', codes: [503] },
];

for (const scenario of unavailable) {
  test(`event state reports unavailable for ${scenario.label} and never promises auto-join`, async () => {
    const f = fixture({ events: [event('event-1', scenario.meetingUrl)], env: scenario.env });
    const res = await f.call();
    assert.equal(res.code, 200); assert.equal(res.body.enabled, false);
    assertAvailability(res.body, false, scenario.reason, false);
  });

  test(`enable rejects ${scenario.label} before deleting a skipped row or scheduling`, async () => {
    const f = fixture({ events: [event('event-1', scenario.meetingUrl)], rows: [row('skipped', { meeting_url: scenario.meetingUrl })], env: scenario.env });
    const res = await f.call('event-bot.js', { method: 'POST' });
    assert.ok(scenario.codes.includes(res.code), `Unexpected status ${res.code}`);
    assert.equal(res.body.ok, false); assert.equal(res.body.enabled, false);
    assert.equal(f.mutations.length, 0); assert.equal(f.schedules.length, 0);
    assert.equal(f.stored[0].status, 'skipped');
  });
}

test('linked scheduled rows are enabled only while the backend and platform are available', async () => {
  for (const [status, available, expectedEnabled] of [['scheduled', true, true], ['skipped', true, false], ['error', true, false], ['scheduled', false, false]]) {
    const f = fixture({ rows: [row(status)], env: available ? {} : { BOT_ORCHESTRATOR_URL: '' } });
    const res = await f.call();
    assert.equal(res.code, 200); assert.equal(res.body.linked, true); assert.equal(res.body.status, status);
    assert.equal(res.body.enabled, expectedEnabled);
    assertAvailability(res.body, available, available ? null : 'bot_backend_unavailable', false);
  }
});

test('enable cannot report an existing scheduled row as enabled when its platform is disabled', async () => {
  const f = fixture({ events: [event('event-1', urls.teams)], rows: [row('scheduled', { meeting_url: urls.teams })], env: { BOT_ENABLED_PLATFORMS: 'google_meet,zoom' } });
  const res = await f.call('event-bot.js', { method: 'POST' });
  assert.equal(res.code, 409); assert.equal(res.body.ok, false); assert.equal(res.body.enabled, false);
  assert.equal(f.schedules.length, 0); assert.equal(f.mutations.length, 0);
});

test('cancelled or declined invitations cannot be manually enabled or removed from skipped state', async () => {
  for (const extra of [{ status: 'cancelled' }, { selfDeclined: true }]) {
    const f = fixture({ events: [{ ...event(), ...extra }], rows: [row('skipped')] });
    const res = await f.call('event-bot.js', { method: 'POST' });
    assert.equal(res.code, 409); assert.equal(res.body.enabled, false);
    assert.equal(res.body.error, 'event_unavailable');
    assert.equal(f.mutations.length, 0); assert.equal(f.schedules.length, 0);
  }
});

test('a live event with its link removed never falls back to a stale stored meeting link', async () => {
  const f = fixture({ events: [event('event-1', null)], rows: [row('skipped')] });
  const res = await f.call('event-bot.js', { method: 'POST' });
  assert.equal(res.code, 400); assert.equal(res.body.error, 'no_meeting_link');
  assert.equal(f.mutations.length, 0); assert.equal(f.schedules.length, 0);
});

test('completed reports remain accessible without promising a new bot', async () => {
  const f = fixture({ rows: [row('done')] });
  const res = await f.call();
  assert.equal(res.code, 200); assert.equal(res.body.status, 'done');
  assert.equal(res.body.enabled, false); assert.equal(res.body.autoJoinEligible, false);
  assert.match(res.body.reportUrl, /\?share=fixture-share$/);
  assert.equal(f.schedules.length, 0); assert.equal(f.mutations.length, 0);
});

test('enable replaces a valid skipped placeholder and requires scheduler acknowledgement', async () => {
  for (const scheduleResult of [{ ok: true }, { already: true }]) {
    const f = fixture({ rows: [row('skipped')], scheduleResult });
    const res = await f.call('event-bot.js', { method: 'POST' });
    assert.equal(res.code, 200); assert.equal(res.body.ok, true); assert.equal(res.body.enabled, true);
    assert.equal(f.schedules.length, 1); assert.equal(f.mutations.length, 1);
    assert.equal(f.mutations[0].request.method, 'DELETE');
    assert.equal(f.schedules[0].rowsAtDispatch.length, 0);
    assert.equal(f.schedules[0].options.calendarEventId, 'event-1');
    assert.equal(f.schedules[0].options.manualRetry, true);
    assert.equal(f.schedules[0].options.joinAt, start);
    assert.equal(f.schedules[0].options.endAt, end);
  }
});

test('authenticated enable preserves the current calendar end or the stored end when the event is unavailable', async () => {
  for (const hasLiveEvent of [true, false]) {
    const storedEnd = new Date(Date.now() + 120 * 60000).toISOString();
    const f = fixture({ rows: [row('error', { end_time: storedEnd })], events: hasLiveEvent ? [event()] : [] });
    const res = await f.call('event-bot.js', { method: 'POST' });
    assert.equal(res.code, 200); assert.equal(res.body.ok, true);
    assert.equal(f.schedules[0].options.endAt, hasLiveEvent ? end : storedEnd);
    assert.equal(f.schedules[0].options.manualRetry, true); assert.equal(f.mutations.length, 0);
  }
});

test('scheduler errors and recording limits never produce enabled:true', async () => {
  const cases = [
    [{ error: 'platform_disabled', status: 409 }, 409],
    [{ error: 'invalid_join_at', status: 400 }, 400],
    [{ error: 'bot_dispatch_failed', status: 502 }, 502],
    [{ error: 'bot_dispatch_timeout', status: 504 }, 504],
    [{ error: 'bot_backend_unavailable' }, 503],
    [{ error: 'recording_limit', limit: true, usedMin: 60, capMin: 60 }, 429],
    [{}, 503],
  ];
  for (const [scheduleResult, code] of cases) {
    const f = fixture({ rows: [row('skipped')], scheduleResult });
    const res = await f.call('event-bot.js', { method: 'POST' });
    assert.equal(res.code, code, JSON.stringify(scheduleResult));
    assert.equal(res.body.ok, false); assert.equal(res.body.enabled, false);
    assert.equal(f.schedules.length, 1);
  }
});

test('calendar exposes availability separately from confirmed bot state using one batch meeting query', async () => {
  const items = [invite('unlinked', urls.google_meet), invite('scheduled', urls.zoom), invite('skipped', urls.teams),
    invite('error', urls.google_meet), invite('no-link', null)];
  const rows = ['scheduled', 'skipped', 'error'].map(status => row(status, { id: `row-${status}`, calendar_event_id: status, meeting_url: items.find(item => item.id === status).location }));
  const f = fixture({ calendarItems: items, rows });
  const res = await f.call('calendar/events.js');
  assert.equal(res.code, 200); assert.equal(res.body.events.length, 5);
  for (const item of res.body.events) {
    const available = item.id !== 'no-link';
    assertAvailability(item, available, available ? null : 'no_meeting_link', item.id === 'unlinked');
    assert.equal(item.botEnabled, item.id === 'scheduled');
    assert.equal(item.botStatus, ['scheduled', 'skipped', 'error'].includes(item.id) ? item.id : null);
    assert.equal(item.organizer, 'host@external.example.test', 'Invitations do not require organizer ownership');
  }
  const meetingQueries = f.queries.filter(({ query }) => query.startsWith('meetings?'));
  assert.equal(meetingQueries.length, 1, 'Avoid one DB lookup per calendar event');
  assert.match(meetingQueries[0].query, /calendar_event_id=in\./);
  assert.equal(f.queries.filter(({ query }) => query.startsWith('app_users?')).length, 1);
  assert.equal(f.schedules.length, 0); assert.equal(f.mutations.length, 0);
  assert.equal(f.http[0].searchParams.get('showHiddenInvitations'), 'true');
});

test('calendar eligibility honors auto-join opt-out while preserving a confirmed scheduled bot', async () => {
  const f = fixture({ autoJoin: false, calendarItems: [invite('event-1', urls.google_meet)], rows: [row('scheduled')] });
  const res = await f.call('calendar/events.js');
  assert.equal(res.code, 200);
  assertAvailability(res.body.events[0], true, null, false);
  assert.equal(res.body.events[0].botEnabled, true);
});

test('calendar unavailable platforms and backends never appear enabled even with scheduled rows', async () => {
  for (const scenario of [
    { env: { BOT_ENABLED_PLATFORMS: 'google_meet' }, reason: 'platform_disabled' },
    { env: { BOT_ORCHESTRATOR_URL: '' }, reason: 'bot_backend_unavailable' },
  ]) {
    const f = fixture({ calendarItems: [invite('event-1', urls.teams)], rows: [row('scheduled', { meeting_url: urls.teams })], env: scenario.env });
    const res = await f.call('calendar/events.js');
    assert.equal(res.code, 200);
    assertAvailability(res.body.events[0], false, scenario.reason, false);
    assert.equal(res.body.events[0].botEnabled, false);
    assert.equal(res.body.events[0].botStatus, 'scheduled');
  }
});
