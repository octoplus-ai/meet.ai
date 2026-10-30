import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationsHandler } from '../api/integrations.js';
import { createReportDelivery } from '../api/lib/deliver.js';
import { createIntegrationSender, IntegrationError, validateIntegrationConfig } from '../api/lib/integration-security.js';

const user = 'fixture-owner';
const hook = 'https://hooks.example.com/secret-path?key=fixture-secret';
const notion = { token: 'secret_fixture_0123456789', parent: '11111111-2222-4333-8444-555555555555' };
const publicLookup = async () => [{ address: '1.1.1.1', family: 4 }];
const report = { title: 'Partner call', summary: 'Agreed next steps', score: 85,
  actionItems: [{ task: 'Send proposal', owner: 'Owner' }], nextSteps: ['Follow up'],
  date: '2026-10-30T12:00:00Z', link: 'https://meet.example.com/report' };
function response() { return { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
const request = (body, method = 'POST') => ({ method, headers: { cookie: 'om_session=fixture-session', 'content-type': 'application/json' }, body });
function databaseFixture(integrations = {}) {
  const calls = [], writes = [];
  const database = async (path, options = {}) => {
    calls.push(path);
    if (path.startsWith('sessions?')) return [{ user_id: user }];
    assert.ok(path.startsWith(`app_users?id=eq.${user}`));
    if (options.method === 'PATCH') { writes.push(options.body.integrations); return null; }
    return [{ integrations }];
  };
  return { database, calls, writes };
}
const validated = (target, config) => validateIntegrationConfig(target, config, { lookup: publicLookup });

test('save validates a public destination, canonicalizes URL and preserves unrelated calendar state', async () => {
  const existing = { calWatch: { channelId: 'calendar-only' }, notion, discord: { url: hook } };
  const f = databaseFixture(existing), res = response();
  await createIntegrationsHandler({ database: f.database, validate: validated })(request({ target: 'slack', config: { url: 'https://HOOKS.example.com:443/receive', autoPush: true } }), res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(f.writes, [{ ...existing, slack: { url: 'https://hooks.example.com/receive', autoPush: true } }]);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('save rejects unknown keys, schema problems, HTTP and private DNS before any settings write', async () => {
  const cases = [
    { target: '__proto__', config: { url: hook } }, { target: 'calWatch', config: null },
    { target: 'constructor', config: { url: hook } }, { target: 'webhooks', config: { url: 'http://hooks.example.com' } },
    { target: 'webhooks', config: { url: hook, headers: { Host: 'localhost' } } },
    { target: 'webhooks', config: { url: hook, autoPush: 'true' } }, { target: 'webhooks' },
    { target: 'webhooks', config: { url: hook } },
  ];
  for (const body of cases) {
    const f = databaseFixture(), res = response();
    const validate = (target, config) => validateIntegrationConfig(target, config, { lookup: async () => [{ address: '127.0.0.1', family: 4 }] });
    await createIntegrationsHandler({ database: f.database, validate })(request(body), res);
    assert.equal(res.code, 400);
    assert.equal(f.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(res.body), /fixture-secret|secret-path|127\.0\.0\.1/);
  }
});

test('disconnect removes an invalid legacy config without DNS and preserves other settings', async () => {
  const f = databaseFixture({ webhooks: { url: 'http://127.0.0.1/private' }, calWatch: { channelId: 'keep' }, notion }), res = response();
  await createIntegrationsHandler({ database: f.database, validate: async () => { assert.fail('disconnect must not resolve DNS'); } })(request({ target: 'webhooks', config: null }), res);
  assert.equal(res.code, 200);
  assert.deepEqual(f.writes, [{ calWatch: { channelId: 'keep' }, notion }]);
});

test('GET exposes connection booleans without credentials or internal calendar settings', async () => {
  const f = databaseFixture({ notion, slack: { url: hook }, webhooks: { url: 'http://hooks.example.com' }, calWatch: { token: 'fixture-secret' } }), res = response();
  await createIntegrationsHandler({ database: f.database, validate: async () => { assert.fail('GET should not resolve or contact destinations'); } })(request(null, 'GET'), res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { connected: { notion: true, slack: true, webhooks: false } });
  assert.doesNotMatch(JSON.stringify(res.body), /fixture-secret|secret_fixture|hooks\.example|calWatch/);
});

test('settings require a valid session and JSON, and database errors are sanitized', async () => {
  const f = databaseFixture(), handler = createIntegrationsHandler({ database: f.database, validate: validated });
  let res = response(); await handler({ ...request({}), headers: {} }, res);
  assert.equal(res.code, 401); assert.equal(f.calls.length, 0);
  res = response(); await createIntegrationsHandler({ database: async () => [] })(request({}), res); assert.equal(res.code, 401);
  res = response(); await handler({ ...request({}), headers: { cookie: 'om_session=fixture', 'content-type': 'text/plain' } }, res); assert.equal(res.code, 415);
  res = response(); await handler(request('{bad JSON fixture-secret'), res); assert.equal(res.code, 400);
  res = response(); await handler(request(null, 'DELETE'), res); assert.equal(res.code, 405);
  res = response(); await createIntegrationsHandler({ database: async () => { throw new Error('provider body fixture-secret'); } })(request({}), res);
  assert.equal(res.code, 500); assert.deepEqual(res.body, { error: 'integration_update_failed' });
  assert.equal(f.writes.length, 0);
});

test('delivery preserves real Slack, Discord, Notion and generic report payloads', async () => {
  const calls = [];
  const deliver = createReportDelivery({ send: async (url, options) => { calls.push({ url, ...options, payload: JSON.parse(options.body) }); return { ok: true, status: 204 }; } });
  for (const target of ['slack', 'discord', 'notion', 'webhooks', 'webhook', 'hubspot', 'salesforce', 'confluence']) {
    assert.deepEqual(await deliver(target, target === 'notion' ? notion : { url: hook, autoPush: false }, report), { ok: true });
  }
  assert.equal(calls.length, 8);
  assert.match(calls[0].payload.text, /Partner call.*85/); assert.match(calls[0].payload.text, /Send proposal \(Owner\)/);
  assert.match(calls[1].payload.content, /Agreed next steps/);
  assert.equal(calls[2].url, 'https://api.notion.com/v1/pages');
  assert.equal(calls[2].headers.Authorization, `Bearer ${notion.token}`);
  assert.equal(calls[2].payload.parent.page_id, notion.parent);
  assert.equal(calls[2].payload.properties.title.title[0].text.content, report.title);
  for (const call of calls.slice(3)) {
    assert.equal(call.url, hook);
    assert.equal(call.payload.summary, report.summary);
    assert.deepEqual(call.payload.action_items, report.actionItems);
    assert.deepEqual(call.payload.next_steps, report.nextSteps);
    assert.equal(call.payload.link, report.link);
    assert.equal(call.headers.Authorization, undefined);
  }
});

test('delivery rejects invalid legacy URLs/configs before sending, including attempted Notion endpoint override', async () => {
  const deliver = createReportDelivery({ send: async () => { assert.fail('invalid configuration reached transport'); } });
  for (const [target, config] of [
    ['slack', { url: 'http://hooks.slack.com/services/fixture-secret' }],
    ['webhooks', { url: 'https://user:fixture-secret@hooks.example.com' }],
    ['webhooks', { url: 'https://127.0.0.1' }], ['calWatch', { url: hook }],
    ['notion', { ...notion, url: hook }],
  ]) {
    const result = await deliver(target, config, report);
    assert.deepEqual(result, { ok: false, error: 'invalid_integration_config', status: 400 });
    assert.doesNotMatch(JSON.stringify(result), /fixture-secret/);
  }
  assert.deepEqual(await deliver('slack', null, report), { ok: false, error: 'not_connected' });
});

test('legacy delivery resolves DNS fresh and blocks private records before opening HTTPS', async () => {
  const cfg = await validated('webhooks', { url: hook });
  const send = createIntegrationSender({ lookup: async () => [{ address: '169.254.169.254', family: 4 }], request: () => assert.fail('private destination opened') });
  const result = await createReportDelivery({ send })('webhooks', cfg, report);
  assert.deepEqual(result, { ok: false, error: 'integration_destination_not_public', status: 400 });
});

test('delivery exposes neither redirect bodies nor provider errors and marks network ambiguity', async () => {
  for (const status of [301, 302, 307, 308, 400, 429, 500]) {
    const deliver = createReportDelivery({ send: async () => ({ ok: false, status, detail: 'provider fixture-secret', body: report }) });
    const result = await deliver('webhooks', { url: hook }, report);
    assert.deepEqual(result, { ok: false, error: status < 400 ? 'integration_redirect_not_allowed' : 'delivery_failed', status });
  }
  for (const error of [new Error('provider body fixture-secret'), new IntegrationError('integration_delivery_unconfirmed', 502)]) {
    const result = await createReportDelivery({ send: async () => { throw error; } })('webhooks', { url: hook }, report);
    assert.equal(result.ok, false); assert.equal(result.uncertain, true);
    assert.equal(result.error, 'integration_delivery_unconfirmed');
    assert.doesNotMatch(JSON.stringify(result), /fixture-secret|provider/);
  }
});
