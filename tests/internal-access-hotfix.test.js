// Run with: node --test tests/internal-access-hotfix.test.js
// All database and OAuth calls are mocked; no environment credentials are read.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = file => fs.readFileSync(path.join(root, file), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export default /g, '')
  .replace(/export (?=(async )?function|const)/g, '');
let count = 0;
const pass = label => { count++; console.log(`PASS ${label}`); };
const env = { APP_INTERNAL_EMAILS: ' SANTIAGO@OCTOPLUSTEAM.COM , other@octoplusteam.com ' };
const helper = vm.createContext({ process: { env } });
vm.runInContext(source('api/lib/internal-plan.js'), helper);
const effectivePlanForUser = helper.effectivePlanForUser;

for (const [label, user, expected] of [
  ['internal identity', { id: 'u', email: 'santiago@octoplusteam.com', plan: 'free' }, 'enterprise'],
  ['normalization', { id: 'u', email: ' SANTIAGO@OCTOPLUSTEAM.COM ', plan: 'free' }, 'enterprise'],
  ['other free account', { id: 'u', email: 'other@example.com', plan: 'free' }, 'free'],
  ['other paid account', { id: 'u', email: 'other@example.com', plan: 'pro' }, 'pro'],
  ['email suffix forgery', { id: 'u', email: 'santiago@octoplusteam.com.evil.test', plan: 'free' }, 'free'],
  ['email prefix forgery', { id: 'u', email: 'evilsantiago@octoplusteam.com', plan: 'free' }, 'free'],
  ['missing stored id', { email: 'santiago@octoplusteam.com', plan: 'free' }, 'free'],
  ['blank stored id', { id: ' ', email: 'santiago@octoplusteam.com', plan: 'free' }, 'free'],
  ['non-string email', { id: 'u', email: ['santiago@octoplusteam.com'], plan: 'free' }, 'free'],
  ['absent identity', null, undefined],
]) {
  assert.equal(effectivePlanForUser(user), expected);
  pass(label);
}
env.APP_INTERNAL_EMAILS = '';
assert.equal(effectivePlanForUser({ id: 'u', email: 'santiago@octoplusteam.com', plan: 'free' }), 'free');
pass('empty configuration grants no privileges');
env.APP_INTERNAL_EMAILS = 'santiago@octoplusteam.com';

let row = { id: 'u', email: 'santiago@octoplusteam.com', plan: 'free', usage: {} };
const plan = vm.createContext({ encodeURIComponent, Date, effectivePlanForUser,
  sb: async query => { assert.match(query, /select=id,email,plan$/); return row ? [row] : []; },
});
vm.runInContext(source('api/lib/plan.js'), plan);
let writes = 0;
const limits = vm.createContext({ encodeURIComponent, Date, effectivePlanForUser,
  PLANS: vm.runInContext('PLANS', plan), planKey: plan.planKey,
  sb: async (query, options = {}) => {
    if (options.method === 'PATCH') { writes++; row.usage = options.body.usage; return null; }
    assert.match(query, /select=id,email,plan,usage$/);
    return row ? [row] : [];
  },
});
vm.runInContext(source('api/lib/limits.js'), limits);
const session = vm.createContext({ encodeURIComponent, decodeURIComponent, Date, effectivePlanForUser,
  sb: async query => query.startsWith('sessions?') ? [{ user_id: 'u' }] : row ? [row] : [],
});
vm.runInContext(source('api/lib/session.js'), session);

assert.equal(await plan.getPlan('u'), 'enterprise');
pass('getPlan uses the stored internal identity');
for (const kind of ['doc', 'deck', 'deck_img']) {
  const quota = await limits.consumeQuota('u', kind);
  assert.equal(quota.ok, true);
  assert.equal(quota.cap, Infinity);
}
assert.equal(writes, 0);
pass('internal AI quotas require no billing/usage write');
const projected = await session.currentUser({ headers: { cookie: 'om_session=valid' } });
assert.equal(projected.plan, 'enterprise');
assert.equal(row.plan, 'free');
pass('existing session projects effective plan without changing stored plan');
row = { id: 'u', email: 'ordinary@example.com', plan: 'free', usage: {} };
assert.equal(await plan.getPlan('u'), 'free');
assert.equal((await limits.consumeQuota('u', 'doc')).ok, false);
pass('ordinary Free account remains blocked');
const spoofed = await session.currentUser({
  headers: { cookie: 'om_session=valid', 'x-email': 'santiago@octoplusteam.com' },
  body: { email: 'santiago@octoplusteam.com', plan: 'enterprise' },
});
assert.equal(spoofed.plan, 'free');
pass('request-body and header cannot spoof account identity');
assert.equal(await session.currentUser({ headers: {}, body: { email: 'santiago@octoplusteam.com' } }), null);
pass('body identity does not create a session');
row = { id: 'u', email: 'ordinary@example.com', plan: 'pro', usage: {} };
const paid = await limits.consumeQuota('u', 'doc');
assert.equal(paid.ok, true);
assert.equal(paid.cap, 40);
assert.equal(paid.used, 1);
assert.equal(writes, 1);
pass('ordinary paid account retains normal metering');
row = null;
assert.equal(await plan.getPlan('missing'), 'free');
pass('missing database record does not gain privileges');

async function oauth(storedPlan, verified, concurrent = false) {
  const usage = { '2026-10': { doc: 9 } };
  let stored = storedPlan && !concurrent
    ? { id: 'u', email: 'santiago@octoplusteam.com', plan: storedPlan, usage, stripe_customer_id: 'customer' } : null;
  const calls = [];
  const callback = vm.createContext({ URL, URLSearchParams, Date, encodeURIComponent,
    process: { env: { GOOGLE_CLIENT_SECRET: 'mock', SUPABASE_SERVICE_ROLE_KEY: 'mock' } },
    console: { log() {}, error() {} }, randomToken: () => 'mock-session',
    fetch: async url => ({ json: async () => url.includes('/token') ? { access_token: 'mock-token' }
      : { email: 'SANTIAGO@OCTOPLUSTEAM.COM', email_verified: verified, name: 'New name', picture: 'new-photo' } }),
    sb: async (query, options = {}) => {
      calls.push(query);
      if (query === 'app_users?on_conflict=email') {
        assert.equal(options.prefer, 'resolution=ignore-duplicates');
        if (concurrent) stored = { id: 'u', email: options.body.email, plan: storedPlan, usage, stripe_customer_id: 'customer' };
        if (!stored) stored = { id: 'u', ...options.body };
        return null;
      }
      if (query.startsWith('app_users?email=eq.')) {
        assert.deepEqual(Object.keys(options.body).sort(), ['name', 'picture']);
        stored = { ...stored, ...options.body };
        return [stored];
      }
      return null;
    },
  });
  vm.runInContext(source('api/auth/google/callback.js'), callback);
  let location;
  await callback.handler({ url: '/api/auth/google/callback?code=mock-code' }, {
    setHeader() {}, writeHead(status, headers) { assert.equal(status, 302); location = headers.Location; }, end() {},
  });
  if (verified !== true) {
    assert.match(location, /auth_error=/);
    assert.equal(calls.length, 0);
    return;
  }
  assert.equal(location, '/');
  assert.equal(stored.plan, storedPlan || 'free');
  if (storedPlan) { assert.deepEqual(stored.usage, usage); assert.equal(stored.stripe_customer_id, 'customer'); }
  assert.equal(calls.filter(query => query === 'sessions').length, 1);
}
for (const existing of ['starter', 'pro', 'business', 'internal']) {
  await oauth(existing, true);
  pass(`OAuth preserves ${existing} plan, usage, and billing`);
}
await oauth(null, true);
pass('OAuth new account starts Free');
await oauth('pro', true, true);
pass('OAuth preserves concurrent paid-account creation');
for (const invalid of [false, undefined, 'true']) {
  await oauth('pro', invalid);
  pass(`OAuth rejects unverified identity (${String(invalid)}) before any write`);
}
console.log(`${count} isolated hotfix checks passed; no real provider or database requests.`);
