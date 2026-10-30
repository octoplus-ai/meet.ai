import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  integrationUrl,
  publicIntegrationAddress,
  normalizeIntegrationConfig,
  validateIntegrationConfig,
  createIntegrationSender,
} from '../api/lib/integration-security.js';

const publicV4 = { address: '8.8.8.8', family: 4 };
const publicV6 = { address: '2606:4700:4700::1111', family: 6 };
const webhook = 'https://hooks.example.com/receive/private-token?key=private-query';
// Deliberately invalid provider identifiers: tests use a fully stubbed transport.
const slack = 'https://hooks.slack.com/services/fixture-team/fixture-channel/not-a-token';
const discord = 'https://discord.com/api/webhooks/fixture-channel/not-a-token?wait=true';
const notion = { token: 'secret_' + 'a'.repeat(40), parent: '11111111-2222-4333-8444-555555555555', autoPush: true };

function safeError(error) {
  assert.ok(error instanceof Error);
  assert.equal(typeof error.code, 'string');
  assert.match(error.code, /^[A-Za-z][A-Za-z0-9_]*$/);
  assert.doesNotMatch(error.message, /private-token|private-query|fixture-secret|169\.254|socket fixture|dns fixture/);
  return true;
}

function transport({ status = 204, hanging = false, failure = null } = {}) {
  const calls = [];
  const request = (...args) => {
    const hasUrl = typeof args[0] === 'string' || args[0] instanceof URL;
    const options = hasUrl ? args[1] : args[0];
    const callback = hasUrl ? args[2] : args[1];
    const req = new EventEmitter();
    const response = new EventEmitter();
    const call = { url: hasUrl ? new URL(args[0]) : null, options, req, response, ended: false, destroyed: false, responseDestroyed: false };
    calls.push(call);
    response.statusCode = status;
    response.headers = status >= 300 && status < 400 ? { location: 'https://169.254.169.254/metadata' } : {};
    response.destroy = () => { call.responseDestroyed = true; return response; };
    response.read = () => { throw new Error('Response bodies must not be read'); };
    response.setEncoding = () => { throw new Error('Response bodies must not be accumulated'); };
    req.setTimeout = (_duration, callback) => { call.socketTimeout = callback; return req; };
    req.destroy = error => {
      call.destroyed = true;
      if (error) queueMicrotask(() => req.emit('error', error));
      return req;
    };
    req.end = body => {
      call.ended = true;
      call.body = body;
      if (!hanging) queueMicrotask(() => failure ? req.emit('error', failure) : callback(response));
      return req;
    };
    return req;
  };
  return { calls, request };
}

const pinnedLookup = (fn, hostname, options = {}) => new Promise((resolve, reject) => {
  fn(hostname, options, (error, address, family) => error ? reject(error) : resolve({ address, family }));
});

test('integration URLs require a public DNS hostname and HTTPS on port 443', () => {
  for (const url of [webhook, slack, discord, 'https://api.notion.com:443/v1/pages']) {
    const result = integrationUrl(url);
    assert.ok(result instanceof URL);
    assert.equal(result.protocol, 'https:');
    assert.equal(result.port, '');
  }
  for (const url of [
    '', null, {}, 'http://hooks.example.com/path', 'ftp://hooks.example.com/path',
    'https://hooks.example.com:8443/path', 'https://user:password@hooks.example.com/path',
    'https://@hooks.example.com/path', 'https:hooks.example.com/path', 'https:/hooks.example.com/path',
    'https://hooks.example.com/path#',
    'https://hooks.example.com/path#fragment', 'https://localhost/path', 'https://host/path',
    'https://127.0.0.1/path', 'https://2130706433/path', 'https://0x7f000001/path',
    'https://[::1]/path', 'https://[::ffff:127.0.0.1]/path', 'https://8.8.8.8/path',
  ]) assert.throws(() => integrationUrl(url), safeError, String(url));
});

test('address policy rejects nonpublic IPv4 and IPv6 including mapped private addresses', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', publicV6.address, '2001:4860:4860::8888']) {
    assert.equal(publicIntegrationAddress(address), true, address);
  }
  for (const address of [
    '0.0.0.0', '10.10.10.10', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '100.64.0.1', '100.127.255.254', '192.0.2.1', '198.18.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd12::1', 'fe80::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', 'not-an-address', '', null,
  ]) assert.equal(publicIntegrationAddress(address), false, String(address));
});

test('config normalization retains supported provider configs and excludes internal targets', () => {
  assert.equal(normalizeIntegrationConfig('slack', { url: slack, autoPush: true }).url, slack);
  assert.equal(normalizeIntegrationConfig('discord', { url: discord, autoPush: false }).url, discord);
  const normalized = normalizeIntegrationConfig('notion', notion);
  assert.equal(normalized.token, notion.token);
  assert.equal(normalized.parent, notion.parent);
  for (const target of ['webhooks', 'webhook', 'confluence', 'hubspot', 'salesforce']) {
    const config = normalizeIntegrationConfig(target, { url: webhook, autoPush: true });
    assert.equal(config.url, webhook);
    assert.equal(config.autoPush, true);
  }
  for (const target of ['calWatch', '__proto__', 'constructor', 'toString', 'unknown', '']) {
    assert.throws(() => normalizeIntegrationConfig(target, { url: webhook }), safeError, target);
  }
  for (const config of [{}, [], 'https://hooks.example.com', { url: 123 }, { url: 'http://hooks.example.com' }]) {
    assert.throws(() => normalizeIntegrationConfig('webhooks', config), safeError);
  }
  for (const config of [
    { url: webhook, autoPush: 'true' }, { url: webhook, headers: { Host: 'localhost' } },
    { url: webhook, token: 'fixture-secret' }, Object.assign(Object.create({ url: webhook }), { autoPush: true }),
  ]) assert.throws(() => normalizeIntegrationConfig('webhooks', config), safeError);
  for (const config of [
    { ...notion, token: 'short' }, { ...notion, token: 'fixture-secret\r\nHeader: injected' },
    { ...notion, parent: 'https://notion.so/page' }, { ...notion, url: webhook },
  ]) assert.throws(() => normalizeIntegrationConfig('notion', config), safeError);
});

test('save validation uses all DNS answers and never trusts an address based on hostname alone', async () => {
  const queries = [];
  const lookup = async (host, options) => { queries.push({ host, options }); return [publicV4, publicV6]; };
  const config = await validateIntegrationConfig('webhooks', { url: webhook }, { lookup, timeoutMs: 100 });
  assert.equal(config.url, webhook);
  assert.deepEqual(queries, [{ host: 'hooks.example.com', options: { all: true, verbatim: true } }]);
  for (const answers of [
    [], [{ address: '127.0.0.1', family: 4 }], [publicV4, { address: 'fd00::1', family: 6 }],
    [publicV6, { address: '169.254.169.254', family: 4 }],
    [publicV4, { address: '::ffff:10.0.0.1', family: 6 }],
  ]) await assert.rejects(validateIntegrationConfig('webhooks', { url: webhook }, { lookup: async () => answers, timeoutMs: 100 }), safeError);
});

test('HTTPS delivery pins approved DNS without a second resolution and preserves hostname TLS', async () => {
  let resolutions = 0;
  const lookup = async () => ++resolutions === 1 ? [publicV4, publicV6] : [{ address: '127.0.0.1', family: 4 }];
  const fixture = transport();
  const send = createIntegrationSender({ lookup, request: fixture.request });
  const body = JSON.stringify({ summary: 'Private fixture summary' });
  const result = await send(webhook, { body, headers: { 'Content-Type': 'application/json' }, timeoutMs: 200 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 204);
  assert.equal(fixture.calls.length, 1);
  const call = fixture.calls[0];
  assert.equal(call.options.agent, false);
  assert.equal(call.options.servername, 'hooks.example.com');
  assert.equal(call.options.rejectUnauthorized, true);
  assert.equal(call.options.minVersion, 'TLSv1.2');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.url?.hostname || call.options.hostname, 'hooks.example.com');
  assert.equal(call.url ? call.url.pathname + call.url.search : call.options.path, '/receive/private-token?key=private-query');
  assert.equal(String(call.body), body);
  assert.deepEqual(await pinnedLookup(call.options.lookup, 'hooks.example.com'), { address: publicV4.address, family: 4 });
  const all = await pinnedLookup(call.options.lookup, 'hooks.example.com', { all: true });
  assert.deepEqual(all.address, [publicV4]);
  assert.equal(resolutions, 1, 'The socket lookup must not resolve the hostname again');
  assert.equal(call.responseDestroyed, true);
});

test('each delivery revalidates stored URLs and rejects a later private DNS answer before HTTPS', async () => {
  let resolutions = 0;
  const lookup = async () => ++resolutions === 1 ? [publicV4] : [{ address: '169.254.169.254', family: 4 }];
  const config = await validateIntegrationConfig('webhooks', { url: webhook }, { lookup, timeoutMs: 100 });
  const fixture = transport();
  await assert.rejects(createIntegrationSender({ lookup, request: fixture.request })(config.url, { body: '{}', timeoutMs: 100 }), safeError);
  assert.equal(resolutions, 2);
  assert.equal(fixture.calls.length, 0);
});

test('delivery rejects mixed public/private answers in either IP family before sending content', async () => {
  for (const answers of [
    [publicV4, { address: 'fe80::1', family: 6 }],
    [publicV6, { address: '192.168.1.1', family: 4 }],
    [publicV4, { address: '::ffff:7f00:1', family: 6 }],
  ]) {
    const fixture = transport();
    const send = createIntegrationSender({ lookup: async () => answers, request: fixture.request });
    await assert.rejects(send(webhook, { body: '{"secret":"fixture-secret"}', timeoutMs: 100 }), safeError);
    assert.equal(fixture.calls.length, 0);
  }
});

test('public IPv6 destinations are pinned without disabling certificate validation', async () => {
  const fixture = transport({ status: 200 });
  const send = createIntegrationSender({ lookup: async () => [publicV6], request: fixture.request });
  assert.equal((await send(webhook, { body: '{}', timeoutMs: 100 })).ok, true);
  assert.deepEqual(await pinnedLookup(fixture.calls[0].options.lookup, 'hooks.example.com'), { address: publicV6.address, family: 6 });
  assert.equal(fixture.calls[0].options.rejectUnauthorized, true);
});

test('redirects and provider errors return status without following Location or reading bodies', async () => {
  for (const status of [301, 302, 303, 307, 308, 400, 429, 500]) {
    const fixture = transport({ status });
    const send = createIntegrationSender({ lookup: async () => [publicV4], request: fixture.request });
    const result = await send(webhook, { body: '{}', timeoutMs: 100 });
    assert.equal(result.ok, false, String(status));
    assert.equal(result.status, status);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].responseDestroyed, true);
    assert.equal(fixture.calls[0].response.listenerCount('data'), 0);
  }
});

test('DNS timeout is bounded for save and delivery and never opens an HTTPS request', async () => {
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const fixture = transport();
    const lookup = async () => new Promise(() => {});
    await assert.rejects(validateIntegrationConfig('webhooks', { url: webhook }, { lookup, timeoutMs: 15 }), safeError);
    await assert.rejects(createIntegrationSender({ lookup, request: fixture.request })(webhook, { body: '{}', timeoutMs: 15 }), safeError);
    assert.equal(fixture.calls.length, 0);
  } finally { clearInterval(keepAlive); }
});

test('a DNS answer arriving after timeout cannot later initiate a request', async () => {
  const fixture = transport();
  let resolveLookup;
  const lookup = () => new Promise(resolve => { resolveLookup = resolve; });
  const send = createIntegrationSender({ lookup, request: fixture.request });
  await assert.rejects(send(webhook, { body: '{}', timeoutMs: 15 }), safeError);
  resolveLookup([publicV4]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.calls.length, 0);
});

test('request deadline destroys stalled HTTPS and does not expose destination secrets', async () => {
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const fixture = transport({ hanging: true });
    const send = createIntegrationSender({ lookup: async () => [publicV4], request: fixture.request });
    await assert.rejects(send(webhook, { body: '{"secret":"fixture-secret"}', timeoutMs: 15 }), safeError);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].destroyed, true);
  } finally { clearInterval(keepAlive); }
});

test('DNS and socket errors are sanitized rather than returning tokens or resolver details', async () => {
  const fixture = transport({ failure: new Error('socket fixture private-token private-query fixture-secret') });
  await assert.rejects(createIntegrationSender({ lookup: async () => [publicV4], request: fixture.request })(webhook, { body: '{}', timeoutMs: 100 }), safeError);
  const untouched = transport();
  await assert.rejects(createIntegrationSender({ lookup: async () => { throw new Error('dns fixture private-token fixture-secret'); }, request: untouched.request })(webhook, { body: '{}', timeoutMs: 100 }), safeError);
  assert.equal(untouched.calls.length, 0);
});

test('invalid DNS result types and unknown HTTP status cannot count as successful delivery', async () => {
  for (const addresses of [null, [{ address: publicV4.address, family: 6 }], [{ address: 'fixture-secret', family: 4 }], [{ address: publicV4.address }]]) {
    const fixture = transport();
    await assert.rejects(createIntegrationSender({ lookup: async () => addresses, request: fixture.request })(webhook, { body: '{}', timeoutMs: 100 }), safeError);
    assert.equal(fixture.calls.length, 0);
  }
  for (const status of [0, 600, '200']) {
    const fixture = transport({ status });
    await assert.rejects(createIntegrationSender({ lookup: async () => [publicV4], request: fixture.request })(webhook, { body: '{}', timeoutMs: 100 }), safeError);
    assert.equal(fixture.calls[0].responseDestroyed, true);
  }
});
