// Exercise the actual reconciliation handler and plan helpers with only DB mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { requireEnabledMeeting, meetingLimitMinutes } from '../shared/meeting-platform.js';

const urls = { google_meet: 'https://meet.google.com/abc-defg-hij', zoom: 'https://zoom.us/j/12345678901?pwd=fixture-only', teams: 'https://teams.microsoft.com/meet/1234567890123?p=fixture-only' };
const source = name => fs.readFileSync(new URL(`../api/${name}`, import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/\bexport default /g, '').replace(/\bexport (?=(?:async )?function|const)/g, '');
const row = (id, extra = {}) => ({ id, user_id: `u-${id}`, meeting_url: urls.google_meet, status: 'scheduled', start_time: new Date(Date.now() - 10 * 60000).toISOString(), status_synced_at: new Date(Date.now() - 3 * 60000).toISOString(), ...extra });
async function feed({ rows = [], users = [], env = {}, lookupError = false, readError = false, secret = 'fixture-only', body = {} } = {}) {
  const calls = [];
  const ctx = vm.createContext({ Date, URL, encodeURIComponent, requireEnabledMeeting, meetingLimitMinutes,
    process: { env: { BOT_INGEST_SECRET: 'fixture-only', ...env } },
    sb: async (query, request = {}) => {
      calls.push({ query, ...request });
      if (query.startsWith('app_users?')) { if (lookupError) throw new Error('fixture lookup unavailable'); return users; }
      if (request.method === 'PATCH') return [];
      if (readError) throw new Error('query failure containing secret and fixture-only URL');
      return rows;
    },
  });
  for (const name of ['lib/internal-plan.js', 'lib/plan.js', 'bot/pending.js']) vm.runInContext(source(name), ctx, { filename: name });
  const res = { status(n) { this.code = n; return this; }, json(value) { this.body = value; return this; } };
  await ctx.handler({ headers: { authorization: `Bearer ${secret}` }, body }, res);
  return { ...res, calls };
}

test('pending feed authenticates before database access', async () => {
  const result = await feed({ secret: 'wrong' }); assert.equal(result.code, 401); assert.equal(result.calls.length, 0);
});

test('pending feed gates every URL by rollout; Meet remains the only default', async () => {
  const rows = Object.entries(urls).map(([platform, meeting_url]) => row(platform, { meeting_url }));
  rows.push(row('spoof', { meeting_url: 'https://meet.google.com.attacker.invalid/abc-defg-hij' }));
  const defaults = await feed({ rows }); assert.deepEqual(Array.from(defaults.body.pending, item => item.meetingId), ['google_meet']);
  const all = await feed({ rows, env: { BOT_ENABLED_PLATFORMS: 'google_meet,zoom,teams' } });
  assert.deepEqual(Array.from(all.body.pending, item => item.meetingId), ['google_meet', 'zoom', 'teams']);
  assert.equal(all.body.pending[1].meetingUrl, urls.zoom);
  const closed = await feed({ rows, env: { BOT_ENABLED_PLATFORMS: 'none' } }); assert.equal(closed.body.pending.length, 0);
});

test('pending feed preserves Free 60m and caps paid/internal plans at 120m using stored identity', async () => {
  const rows = ['free', 'paid', 'internal', 'unknown'].map(id => row(id));
  const users = [
    { id: 'u-free', email: 'ordinary@example.test', plan: 'free', notetaker_name: 'Free bot' },
    { id: 'u-paid', email: 'paid@example.test', plan: 'pro' },
    { id: 'u-internal', email: 'internal@example.test', plan: 'free' },
    { id: 'u-unknown', email: 'unknown@example.test', plan: 'unknown-plan' },
  ];
  const result = await feed({ rows, users, env: { APP_INTERNAL_EMAILS: 'internal@example.test' }, body: { email: 'internal@example.test', plan: 'enterprise' } });
  assert.deepEqual(Array.from(result.body.pending, item => item.maxMeetingMin), [60, 120, 120, 60]);
  assert.equal(result.body.pending[0].botName, 'Free bot');
  assert(result.calls.some(call => call.query.includes('select=id,email,plan,notetaker_name')));
});

test('missing owners and lookup failures conservatively retain a 60-minute cap', async () => {
  for (const lookupError of [false, true]) {
    const result = await feed({ rows: [row('missing')], lookupError });
    assert.equal(result.code, 200); assert.equal(result.body.pending[0].maxMeetingMin, 60);
  }
});

test('admission timeouts retry inside the meeting window; denied/auth/captcha/policy never retry', async () => {
  const retry = ['NOT_ADMITTED_TIMEOUT', 'REQUEST_TIMEOUT', 'HARD_TIMEOUT', 'ADMISSION_TIMEOUT'];
  const blocked = ['AUTH_REQUIRED', 'MEETING_DENIED', 'CAPTCHA_REQUIRED', 'POLICY_BLOCKED', 'PASSCODE_REQUIRED', 'PASSCODE_INVALID', 'MEETING_DENIED ADMISSION_TIMEOUT'];
  const rows = [...retry, ...blocked].map(error => row(error, { status: 'error', error }));
  rows.push(row('cooldown', { status: 'error', error: 'ADMISSION_TIMEOUT', status_synced_at: new Date().toISOString() }));
  rows.push(row('expired', { status: 'error', error: 'ADMISSION_TIMEOUT', start_time: new Date(Date.now() - 3 * 3600000).toISOString() }));
  const result = await feed({ rows });
  assert.deepEqual(Array.from(result.body.pending, item => item.meetingId), retry);
});

test('pending feed failures return no raw database message or meeting secret', async () => {
  const result = await feed({ readError: true }); assert.equal(result.code, 500); assert.equal(result.body.error, 'pending_feed_failed');
});
