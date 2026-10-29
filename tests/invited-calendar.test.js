// Real calendar/scheduling handlers with DB and HTTP boundaries in memory.
// These tests never connect to Google, a meeting provider, or an orchestrator.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { extractMeetingUrl, parseMeetingUrl, enabledPlatforms, meetingLimitMinutes } from '../shared/meeting-platform.js';

const source = name => fs.readFileSync(new URL(`../api/${name}`, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/\bexport default /g, '')
  .replace(/\bexport (?=(?:async )?function|const)/g, '');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
const now = Date.now();
const start = new Date(now + 60 * 60000).toISOString();
const end = new Date(now + 90 * 60000).toISOString();
const urls = {
  google_meet: 'https://meet.google.com/abc-defg-hij',
  zoom: 'https://zoom.us/j/12345678901?pwd=fixture-only',
  teams: 'https://teams.microsoft.com/meet/1234567890123?p=fixture-only',
};
const invite = (id, platform, responseStatus = 'accepted', extra = {}) => ({
  id, summary: `Invitation ${id}`, status: 'confirmed', start: { dateTime: start }, end: { dateTime: end },
  organizer: { email: 'host@external.example.test', self: false },
  attendees: [{ email: 'member@example.test', self: true, responseStatus }],
  location: urls[platform], ...extra,
});

function calendar(pages, { ui = false } = {}) {
  const calls = [];
  const context = vm.createContext({ Date, URL, URLSearchParams, encodeURIComponent, extractMeetingUrl, parseMeetingUrl, enabledPlatforms,
    resolveZoomCaptureRoute: async () => ({ mode: 'browser' }),
    process: { env: { BOT_ENABLED_PLATFORMS: 'google_meet,zoom,teams', BOT_ORCHESTRATOR_URL: 'https://orchestrator.example.test' } },
    parseCookies: () => ({ om_session: 'fixture-session' }),
    sb: async query => query.startsWith('sessions?') ? [{ user_id: 'member' }] : [{ access_token: 'fixture-token', expiry: '2099-01-01' }],
    fetch: async (input, options = {}) => {
      const url = new URL(input); calls.push(url);
      assert.equal(url.origin, 'https://www.googleapis.com');
      assert.equal(url.pathname, '/calendar/v3/calendars/primary/events');
      assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      const index = url.searchParams.get('pageToken') === 'next-fixture' ? 1 : 0;
      return { json: async () => pages[index] };
    },
  });
  vm.runInContext(source(ui ? 'calendar/events.js' : 'lib/google.js'), context);
  return { context, calls };
}

function scheduler(events, prior = [], { truncated = false, error, fetchedAt = now, clock = () => now } = {}) {
  const rows = prior.map(row => ({ user_id: 'member', ...row })), dispatched = [], stopped = [];
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock()])); }
    static now() { return clock(); }
  }
  const context = vm.createContext({ Date: FixtureDate, URL, encodeURIComponent, parseMeetingUrl, enabledPlatforms, meetingLimitMinutes, AbortSignal,
    process: { env: { BOT_ORCHESTRATOR_URL: 'https://orchestrator.example.test', BOT_ENABLED_PLATFORMS: 'google_meet,zoom,teams' } },
    recordingGate: async () => ({ allow: true, maxMeetingMin: 120 }),
    resolveZoomCaptureRoute: async () => ({ mode: 'browser' }),
    listUpcomingEvents: async () => ({ events, error, truncated, fetchedAt }),
    annotateEvent: async () => false, // External organizers need not grant editing rights.
    stopOrchestratorJob: async id => { stopped.push(id); },
    sb: async (query, request = {}) => {
      if (query === 'meetings' && request.method === 'POST') {
        const row = { id: `row-${rows.length + 1}`, ...request.body }; rows.push(row); return [row];
      }
      const params = new URLSearchParams(query.split('?')[1]);
      const equal = name => params.get(name)?.replace(/^eq\./, '');
      if (request.method === 'PATCH') {
        const row = rows.find(item => item.id === equal('id')); assert.ok(row, 'PATCH must target an existing row');
        Object.assign(row, request.body); return [row];
      }
      if (params.get('calendar_event_id') === 'not.is.null') {
        const statuses = params.get('status').slice(4, -1).split(',');
        const comparisons = { gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b };
        return rows.filter(row => row.user_id === equal('user_id') && row.calendar_event_id != null && statuses.includes(row.status) &&
          params.getAll('start_time').every(filter => {
            const dot = filter.indexOf('.');
            const compare = comparisons[filter.slice(0, dot)];
            assert.ok(compare, `Unsupported fixture time filter: ${filter}`);
            return compare(new Date(row.start_time).getTime(), new Date(filter.slice(dot + 1)).getTime());
          }));
      }
      if (params.has('calendar_event_id')) return rows.filter(row => row.calendar_event_id === equal('calendar_event_id'));
      if (params.has('meeting_url')) return rows.filter(row => row.meeting_url === equal('meeting_url') && ['scheduled', 'joining', 'in_call', 'recording', 'processing'].includes(row.status));
      throw new Error(`Unexpected fixture DB query: ${query}`);
    },
    fetch: async (url, request) => {
      assert.equal(url, 'https://orchestrator.example.test/bots');
      dispatched.push(JSON.parse(request.body));
      return { ok: true, status: 201, json: async () => ({ id: `job-${dispatched.length}`, state: 'queued' }) };
    },
  });
  vm.runInContext(source('lib/schedule.js'), context);
  return { context, rows, dispatched, stopped };
}

test('Google paginates invitations including hidden invitations and preserves external organizers and response state', async () => {
  const fixture = calendar([
    { items: [invite('accepted', 'google_meet'), invite('tentative', 'zoom', 'tentative')], nextPageToken: 'next-fixture' },
    { items: [invite('pending', 'teams', 'needsAction'), invite('declined', 'zoom', 'declined'), invite('cancelled', 'teams', 'accepted', { status: 'cancelled' })] },
  ]);
  const result = await fixture.context.listUpcomingEvents('member');
  assert.equal(fixture.calls.length, 2);
  for (const url of fixture.calls) {
    assert.equal(url.searchParams.get('showHiddenInvitations'), 'true');
    assert.equal(url.searchParams.get('showDeleted'), 'false');
    assert.equal(url.searchParams.get('singleEvents'), 'true');
  }
  assert.equal(result.truncated, false); assert.equal(result.events.length, 5);
  assert.ok(result.events.every(event => event.organizer === 'host@external.example.test'));
  assert.deepEqual(Array.from(result.events, event => event.selfDeclined), [false, false, false, true, false]);
  assert.equal(result.events.find(event => event.id === 'cancelled').status, 'cancelled');
});

test('calendar UI requests hidden invitations too, so auto-joined invitations remain visible to the member', async () => {
  const fixture = calendar([{ items: [invite('external', 'zoom', 'needsAction'),
    invite('declined', 'zoom', 'declined'), invite('cancelled', 'teams', 'accepted', { status: 'cancelled' }),
  ] }], { ui: true });
  const res = response(); await fixture.context.handler({ headers: {} }, res);
  assert.equal(res.code, 200); assert.equal(res.body.events[0].organizer, 'host@external.example.test');
  assert.equal(res.body.events.length, 1, 'Rejected invitations must not appear auto-join enabled');
  assert.equal(fixture.calls[0].searchParams.get('showHiddenInvitations'), 'true');
  assert.equal(fixture.calls[0].searchParams.get('showDeleted'), 'false');
});

test('accepted, tentative and pending invitations schedule the own bot for Meet, Zoom and Teams even with an external organizer', async () => {
  for (const platform of Object.keys(urls)) for (const status of ['accepted', 'tentative', 'needsAction']) {
    const feed = calendar([{ items: [invite(`${platform}-${status}`, platform, status)] }]);
    const { events } = await feed.context.listUpcomingEvents('member');
    const fixture = scheduler(events);
    const result = await fixture.context.armUserCalendar('member');
    assert.equal(result.armed, 1, `${platform}/${status}`); assert.equal(fixture.dispatched.length, 1);
    assert.equal(fixture.dispatched[0].platform, platform); assert.equal(fixture.dispatched[0].userId, 'member');
    assert.equal(fixture.rows[0].calendar_event_id, `${platform}-${status}`);
    assert.equal(fixture.rows[0].start_time, start);
    assert.equal(fixture.rows[0].end_time, end);
  }
});

test('hosted events retain the same start, end and capture cap as invited events on all platforms', async () => {
  for (const platform of Object.keys(urls)) {
    const feed = calendar([{ items: [invite(`hosted-${platform}`, platform, 'accepted', { organizer: { self: true, email: 'member@example.test' } })] }]);
    const { events } = await feed.context.listUpcomingEvents('member');
    const fixture = scheduler(events);
    assert.equal((await fixture.context.armUserCalendar('member')).armed, 1);
    assert.equal(fixture.rows[0].start_time, start); assert.equal(fixture.rows[0].end_time, end);
    assert.equal(fixture.dispatched[0].platform, platform); assert.equal(fixture.dispatched[0].maxMeetingMin, 120);
  }
});

test('creating a calendar meeting forwards its returned end time to the own-bot scheduler', async () => {
  let scheduled;
  const context = vm.createContext({ Date, encodeURIComponent, crypto: { randomUUID: () => 'fixture-id' },
    parseCookies: () => ({ om_session: 'fixture-session' }),
    sb: async query => query.startsWith('sessions?') ? [{ user_id: 'member' }] : [{ auto_join: true }],
    getValidToken: async () => 'fixture-token',
    fetch: async (url, request) => {
      assert.equal(url, 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all');
      const event = JSON.parse(request.body);
      assert.equal(event.end.dateTime, end);
      return { ok: true, json: async () => ({ ...event, id: 'created', hangoutLink: urls.google_meet }) };
    },
    scheduleBot: async (uid, options) => { assert.equal(uid, 'member'); scheduled = options; return { ok: true }; },
  });
  vm.runInContext(source('calendar/create-meeting.js'), context);
  const res = response();
  await context.handler({ method: 'POST', headers: {}, body: { title: 'Fixture', start, durationMin: 30 } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.ok, true);
  assert.equal(scheduled.joinAt, start); assert.equal(scheduled.endAt, end); assert.equal(scheduled.calendarEventId, 'created');
});

test('a second calendar sweep does not duplicate bots or rows for the same invited meetings', async () => {
  const feed = calendar([{ items: Object.keys(urls).map(platform => invite(platform, platform)) }]);
  const { events } = await feed.context.listUpcomingEvents('member');
  const fixture = scheduler(events);
  assert.equal((await fixture.context.armUserCalendar('member')).armed, 3);
  const again = await fixture.context.armUserCalendar('member');
  assert.equal(again.armed, 0); assert.equal(again.already, 3);
  assert.equal(fixture.rows.length, 3); assert.equal(fixture.dispatched.length, 3);
});

test('declined and cancelled invitations never dispatch and stop already scheduled bots', async () => {
  const feed = calendar([{ items: [invite('declined', 'zoom', 'declined'), invite('cancelled', 'teams', 'accepted', { status: 'cancelled' })] }]);
  const { events } = await feed.context.listUpcomingEvents('member');
  const prior = events.map(event => ({ id: `row-${event.id}`, calendar_event_id: event.id, status: 'scheduled', meeting_url: event.meetingUrl, start_time: start }));
  const fixture = scheduler(events, prior);
  const result = await fixture.context.armUserCalendar('member');
  assert.equal(result.armed, 0); assert.equal(fixture.dispatched.length, 0); assert.equal(result.disarmed, 2);
  assert.deepEqual(fixture.stopped.sort(), ['row-cancelled', 'row-declined']);
  assert.ok(fixture.rows.every(row => row.status === 'skipped'));
});

for (const state of ['cancelled', 'declined', 'missing']) {
  test(`an invitation ${state} 30 seconds before its start stops its scheduled or joining bot`, async () => {
    const imminent = new Date(now + 30000).toISOString();
    const events = state === 'missing' ? [] : [{ id: 'imminent', meetingUrl: urls.zoom, start: imminent,
      status: state === 'cancelled' ? 'cancelled' : 'confirmed', selfDeclined: state === 'declined' }];
    for (const status of ['scheduled', 'joining']) {
      const fixture = scheduler(events, [{ id: 'imminent-bot', calendar_event_id: 'imminent',
        status, meeting_url: urls.zoom, start_time: imminent }]);
      const result = await fixture.context.armUserCalendar('member');
      assert.equal(result.armed, 0); assert.equal(fixture.dispatched.length, 0);
      assert.equal(result.disarmed, 1, `${state}/${status}`);
      assert.equal(fixture.rows[0].status, 'skipped');
      assert.deepEqual(fixture.stopped, ['imminent-bot']);
    }
  });
}

test('absence never stops a meeting that has started or a bot already recording', async () => {
  const prior = [
    { id: 'at-start', status: 'scheduled', start_time: new Date(now).toISOString() },
    { id: 'started', status: 'joining', start_time: new Date(now - 1000).toISOString() },
    { id: 'in-call', status: 'in_call', start_time: new Date(now + 30000).toISOString() },
    { id: 'recording', status: 'recording', start_time: new Date(now + 30000).toISOString() },
  ].map(row => ({ calendar_event_id: row.id, meeting_url: urls.zoom, ...row }));
  const fixture = scheduler([], prior);
  const result = await fixture.context.armUserCalendar('member');
  assert.equal(result.disarmed, 0); assert.deepEqual(fixture.stopped, []);
  assert.deepEqual(fixture.rows.map(row => row.status), prior.map(row => row.status));
});

test('a slow calendar sweep cannot disarm an absent meeting that started after the feed was fetched', async () => {
  const fixture = scheduler([], [{ id: 'started-during-fetch', calendar_event_id: 'live', status: 'joining',
    meeting_url: urls.zoom, start_time: new Date(now + 30000).toISOString() }], { clock: () => now + 45000 });
  const result = await fixture.context.armUserCalendar('member');
  assert.equal(result.disarmed, 0); assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.rows[0].status, 'joining');
});

test('a meeting that starts while the disarm query is running remains untouched', async () => {
  let clock = now;
  const fixture = scheduler([], [{ id: 'started-during-query', calendar_event_id: 'live', status: 'joining',
    meeting_url: urls.zoom, start_time: new Date(now + 30000).toISOString() }], { clock: () => clock });
  const query = fixture.context.sb;
  fixture.context.sb = async (...args) => {
    const result = await query(...args);
    if (args[0].includes('calendar_event_id=not.is.null')) clock = now + 45000;
    return result;
  };
  const result = await fixture.context.armUserCalendar('member');
  assert.equal(result.disarmed, 0); assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.rows[0].status, 'joining');
});

test('truncated and failed calendar feeds never disarm an imminent missing invitation', async () => {
  for (const options of [{ truncated: true }, { error: 'calendar auth failed' }]) {
    const fixture = scheduler([], [{ id: 'still-scheduled', calendar_event_id: 'imminent', status: 'scheduled',
      meeting_url: urls.zoom, start_time: new Date(now + 30000).toISOString() }], options);
    await fixture.context.armUserCalendar('member');
    assert.deepEqual(fixture.stopped, []); assert.equal(fixture.rows[0].status, 'scheduled');
  }
});

test('the far edge of the calendar fetch window stays protected from absence-based disarming', async () => {
  const fixture = scheduler([], [{ id: 'far-edge', calendar_event_id: 'future', status: 'scheduled',
    meeting_url: urls.zoom, start_time: new Date(now + 7 * 86400000 - 5 * 60000).toISOString() }]);
  const result = await fixture.context.armUserCalendar('member');
  assert.equal(result.disarmed, 0); assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.rows[0].status, 'scheduled');
});

test('an unanswered external invitation in the last minute remains eligible and is not disarmed', async () => {
  const feed = calendar([{ items: [invite('external-imminent', 'zoom', 'needsAction', {
    start: { dateTime: new Date(now + 30000).toISOString() },
  })] }]);
  const { events } = await feed.context.listUpcomingEvents('member');
  const fixture = scheduler(events);
  const result = await fixture.context.armUserCalendar('member');
  assert.equal(result.armed, 1); assert.equal(result.disarmed, 0);
  assert.equal(fixture.dispatched.length, 1); assert.deepEqual(fixture.stopped, []);
  assert.equal(fixture.rows[0].calendar_event_id, 'external-imminent');
});

test('an invited meeting disabled manually stays disabled during automatic sweeps', async () => {
  const feed = calendar([{ items: [invite('manual-off', 'google_meet')] }]);
  const { events } = await feed.context.listUpcomingEvents('member');
  const fixture = scheduler(events, [{ id: 'manual', calendar_event_id: 'manual-off', status: 'skipped', error: null, meeting_url: urls.google_meet, start_time: start }]);
  const result = await fixture.context.armUserCalendar('member');
  assert.equal(result.armed, 0); assert.equal(fixture.dispatched.length, 0); assert.equal(fixture.rows.length, 1);
  assert.equal(fixture.rows[0].status, 'skipped');
});

async function armAll({ session = true, autoJoin = true, backend = true } = {}) {
  const calls = [], queries = [];
  const context = vm.createContext({ Date, encodeURIComponent,
    process: { env: { BOT_ORCHESTRATOR_URL: backend ? 'https://orchestrator.example.test' : undefined } },
    parseCookies: () => session ? { om_session: 'fixture-session' } : {},
    sb: async query => { queries.push(query); return query.startsWith('sessions?') ? (session ? [{ user_id: 'member' }] : []) : [{ auto_join: autoJoin, recall_calendar_id: 'old-recall-calendar', notetaker_name: 'Member bot' }]; },
    armUserCalendar: async (...args) => { calls.push(args); return { armed: 1 }; },
  });
  vm.runInContext(source('calendar/arm-all.js'), context);
  const res = response(); await context.handler({ method: 'POST', headers: {} }, res);
  return { res, calls, queries };
}

test('arm-all uses the own bot for a signed-in member with a legacy Recall calendar', async () => {
  const result = await armAll();
  assert.equal(result.res.code, 200); assert.equal(result.res.body.armed, 1);
  assert.equal(result.calls.length, 1); assert.equal(result.calls[0][0], 'member');
});

test('arm-all rejects missing sessions and missing backend, and honors the member auto-join off switch', async () => {
  const anonymous = await armAll({ session: false });
  assert.equal(anonymous.res.code, 401); assert.equal(anonymous.calls.length, 0);
  const disabled = await armAll({ autoJoin: false });
  assert.equal(disabled.res.body.autoJoin, false); assert.equal(disabled.calls.length, 0);
  const unavailable = await armAll({ backend: false });
  assert.equal(unavailable.res.code, 503); assert.equal(unavailable.calls.length, 0);
});

test('autonomous sweep includes default-on members and legacy calendar members while excluding explicit opt-outs', async () => {
  const armed = [], watched = [], queries = [], cleanups = [];
  const context = vm.createContext({ Date, URL,
    process: { env: { BOT_ORCHESTRATOR_URL: 'https://orchestrator.example.test', CRON_SECRET: 'fixture-cron' } },
    sb: async query => { queries.push(query); return [
      { id: 'enabled', auto_join: true }, { id: 'default', auto_join: null, recall_calendar_id: 'old-calendar' }, { id: 'off', auto_join: false },
    ]; },
    armUserCalendar: async id => { armed.push(id); return { armed: 1 }; },
    ensureWatch: async id => { watched.push(id); return { fresh: true }; },
    sweepRtmsDeletions: async options => { cleanups.push(options); return {}; },
  });
  vm.runInContext(source('cron/auto-join.js'), context);
  const res = response();
  await context.handler({ url: '/api/cron/auto-join', headers: { authorization: 'Bearer fixture-cron' } }, res);
  assert.equal(res.code, 200);
  assert.ok(queries[0].includes('auto_join.is.null'), 'DB query must include default-on null values');
  assert.deepEqual(armed, ['enabled', 'default']); assert.deepEqual(watched, ['enabled', 'default']);
  assert.equal(cleanups.length, 1); assert.equal(cleanups[0].limit, 1);
});
