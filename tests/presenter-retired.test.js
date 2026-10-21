import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadHandler(path, globals = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export default async function handler', 'async function handler');
  const context = vm.createContext({ ...globals });
  vm.runInContext(source, context);
  return context.handler;
}
const response = () => ({ code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); } });

test('legacy worker config is always off and never reads saved preferences', async () => {
  const handler = loadHandler('../api/bot/config.js', { process: { env: { BOT_INGEST_SECRET: 'test-only' } } });
  for (const headers of [{ authorization: 'Bearer test-only' }, { 'x-bot-ingest-secret': 'test-only' }]) {
    const res = response();
    await handler({ method: 'GET', headers, query: { meetingId: 'fixture', pipDuringShare: true } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, { pipDuringShare: false, pipCorner: 'br' });
  }
});

test('legacy worker config still requires authentication and meeting id', async () => {
  const handler = loadHandler('../api/bot/config.js', { process: { env: { BOT_INGEST_SECRET: 'test-only' } } });
  for (const [headers, query, code] of [[{}, { meetingId: 'fixture' }, 401], [{ authorization: 'Bearer test-only' }, {}, 400]]) {
    const res = response();
    await handler({ method: 'GET', headers, query }, res);
    assert.equal(res.code, code);
  }
});

test('config error fallback cannot turn capture back on', async () => {
  const handler = loadHandler('../api/bot/config.js', { process: { env: { BOT_INGEST_SECRET: 'test-only' } } });
  const res = response();
  await handler({ get headers() { throw new Error('synthetic failure'); } }, res);
  assert.equal(res.body.pipDuringShare, false);
});

test('settings hide retired preferences and ignore attempts to re-enable them', async () => {
  const writes = [];
  const saved = { autoRecap: false, internalAccess: true, internalRole: 'Viewer', pipDuringShare: true, pipCorner: 'tl' };
  const handler = loadHandler('../api/settings.js', {
    parseCookies: () => ({ om_session: 'fixture' }),
    sb: async (path, options = {}) => {
      if (path.startsWith('sessions?')) return [{ user_id: 'fixture-user' }];
      if (options.method === 'PATCH') { writes.push(options.body); return []; }
      return [{ sharing_prefs: saved, policy: { autoJoin: true } }];
    },
  });
  const get = response();
  await handler({ method: 'GET' }, get);
  assert.equal(get.code, 200);
  assert.equal(get.body.sharing_prefs.autoRecap, false);
  assert.equal(get.body.sharing_prefs.internalRole, 'Viewer');
  assert.equal(Object.hasOwn(get.body.sharing_prefs, 'pipDuringShare'), false);
  assert.equal(Object.hasOwn(get.body.sharing_prefs, 'pipCorner'), false);
  assert.equal(writes.length, 0);
  const post = response();
  await handler({ method: 'POST', body: { sharing_prefs: { pipDuringShare: true, pipCorner: 'br', externalAccess: true } } }, post);
  assert.equal(post.code, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].sharing_prefs.autoRecap, false);
  assert.equal(writes[0].sharing_prefs.internalRole, 'Viewer');
  assert.equal(writes[0].sharing_prefs.externalAccess, true);
  assert.equal(Object.hasOwn(writes[0].sharing_prefs, 'pipDuringShare'), false);
  assert.equal(Object.hasOwn(writes[0].sharing_prefs, 'pipCorner'), false);
  assert.equal(saved.pipDuringShare, true, 'reads do not mutate existing stored data');
});

test('settings remain closed to unauthenticated callers', async () => {
  const handler = loadHandler('../api/settings.js', { parseCookies: () => ({}), sb: async () => [] });
  const res = response();
  await handler({ method: 'POST', body: { sharing_prefs: { pipDuringShare: true } } }, res);
  assert.equal(res.code, 401);
});
