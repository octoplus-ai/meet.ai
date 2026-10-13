// Isolated hotfix integration tests. Every fetch is mocked, including DB and providers.
// Run with: node --test tests/internal-owner-hotfix.test.js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
Object.assign(process.env, {
  SUPABASE_URL: "https://hotfix-db.test", SUPABASE_SERVICE_ROLE_KEY: "mock-only",
  ANTHROPIC_API_KEY: "mock-only", OPENAI_API_KEY: "",
  APP_INTERNAL_EMAILS: "santiago@octoplusteam.com",
});
const { default: document } = await import(pathToFileURL(path.join(root, "api/document.js")));
const { default: slides } = await import(pathToFileURL(path.join(root, "api/slides.js")));
const OWNER = "owner-fixture", FOREIGN = "other-fixture", SHARE = "a".repeat(48);
const MEETING = { id: "meeting-fixture", user_id: OWNER, title: "Synthetic meeting", shares: [{ token: SHARE, email: "viewer@example.test", role: "Viewer" }], reports: [{ transcript: "Synthetic transcript only" }] };
const json = (data) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

function mockNetwork(t, { sessionUid = null, cached = false } = {}) {
  const counts = { provider: 0, quotaLookup: 0, quotaWrite: 0 };
  t.mock.method(globalThis, "fetch", async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === "hotfix-db.test") {
      if (url.pathname.endsWith("/sessions")) return json(sessionUid ? [{ user_id: sessionUid }] : []);
      if (url.pathname.endsWith("/meetings")) {
        const ownerFilter = url.searchParams.get("user_id"), idFilter = url.searchParams.get("id");
        if (ownerFilter && ownerFilter !== `eq.${OWNER}`) return json([]);
        if (idFilter?.startsWith("eq.") && idFilter !== `eq.${MEETING.id}`) return json([]);
        return json([MEETING]);
      }
      if (url.pathname.endsWith("/app_users")) {
        if (options.method === "PATCH") { counts.quotaWrite++; return json([]); }
        counts.quotaLookup++;
        const uid = url.searchParams.get("id")?.slice(3);
        return json([{ id: uid, email: uid === OWNER ? "santiago@octoplusteam.com" : "other@example.test", plan: "free", usage: {} }]);
      }
      if (url.pathname.endsWith("/artifacts")) return json(cached && (!options.method || options.method === "GET") ? [{ payload: { title: "Saved synthetic", deck: { title: "Saved deck", slides: [] } }, meta: {} }] : []);
      throw new Error("Unexpected mocked DB route");
    }
    if (url.hostname === "api.anthropic.com") {
      counts.provider++;
      return json({ content: [{ text: JSON.stringify({ title: "Synthetic result", sections: [], slides: [] }) }] });
    }
    throw new Error("External network disabled for isolated hotfix tests");
  });
  return counts;
}

for (const [name, handler] of [["document", document], ["slides", slides]]) {
  test(`${name}: anonymous internal-owner share cannot generate or regenerate`, async (t) => {
    const counts = mockNetwork(t);
    for (const regenerate of [false, true]) {
      const res = response();
      await handler({ method: "POST", headers: {}, body: { shareToken: SHARE, regenerate, plan: "enterprise", email: "santiago@octoplusteam.com", userId: OWNER } }, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.error, "owner_required");
    }
    assert.deepEqual(counts, { provider: 0, quotaLookup: 0, quotaWrite: 0 });
  });
  test(`${name}: signed-in foreign user cannot spend internal-owner quota via a share`, async (t) => {
    const counts = mockNetwork(t, { sessionUid: FOREIGN });
    const res = response();
    await handler({ method: "POST", headers: { cookie: "om_session=foreign-fixture" }, body: { meetingId: MEETING.id, shareToken: SHARE, regenerate: true } }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(counts, { provider: 0, quotaLookup: 0, quotaWrite: 0 });
  });
  test(`${name}: an expired owner session plus a share remains unauthorized to generate`, async (t) => {
    const counts = mockNetwork(t);
    const res = response();
    await handler({ method: "POST", headers: { cookie: "om_session=expired-fixture" }, body: { meetingId: MEETING.id, shareToken: SHARE } }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(counts, { provider: 0, quotaLookup: 0, quotaWrite: 0 });
  });
  test(`${name}: authenticated real owner can generate and regenerate with internal entitlement`, async (t) => {
    const counts = mockNetwork(t, { sessionUid: OWNER });
    for (const regenerate of [false, true]) {
      const res = response();
      await handler({ method: "POST", headers: { cookie: "om_session=owner-fixture" }, body: { meetingId: MEETING.id, regenerate } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.cached, false);
    }
    assert.deepEqual(counts, { provider: 2, quotaLookup: 2, quotaWrite: 0 });
  });
  test(`${name}: partially owned multi-meeting selection cannot silently spend quota`, async (t) => {
    const counts = mockNetwork(t, { sessionUid: OWNER });
    const res = response();
    await handler({ method: "POST", headers: { cookie: "om_session=owner-fixture" }, body: { meetingIds: [MEETING.id, "foreign-meeting-fixture"] } }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(counts, { provider: 0, quotaLookup: 0, quotaWrite: 0 });
  });
  test(`${name}: prior shared cache reads remain available without generation`, async (t) => {
    const counts = mockNetwork(t, { cached: true });
    const res = response();
    await handler({ method: "POST", headers: {}, body: { shareToken: SHARE } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.cached, true);
    assert.deepEqual(counts, { provider: 0, quotaLookup: 0, quotaWrite: 0 });
  });
}
