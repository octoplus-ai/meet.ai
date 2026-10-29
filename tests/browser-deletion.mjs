import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5194";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 800 } });
  const errors = [], unexpected = []; let requests = 0, meetingRequests = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(base).origin) { unexpected.push(url.href); return route.abort(); }
    if (url.pathname === "/tests/deletion-harness.html") return route.fulfill({ contentType: "text/html", body: '<html><body><div id="root"></div><script>window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/tests/deletion-harness.jsx"></script></body></html>' });
    if (url.pathname === "/api/account/delete") {
      requests++;
      assert.equal(route.request().method(), "POST");
      assert.deepEqual(route.request().postDataJSON(), { confirmEmail: "owner@example.invalid" });
      return route.fulfill({ status: requests === 1 ? 503 : requests === 2 ? 202 : 200, contentType: "application/json", body: JSON.stringify(requests === 1 ? { error: "private-diagnostic" } : requests === 2 ? { ok: true, pending: true, deletion: "requested" } : { ok: true, pending: false }) });
    }
    if (url.pathname === "/api/meeting-delete") {
      meetingRequests++;
      assert.deepEqual(route.request().postDataJSON(), { meetingId: '33333333-3333-4333-8333-333333333333' });
      return route.fulfill({ status: meetingRequests === 1 ? 202 : 200, contentType: "application/json", body: JSON.stringify(meetingRequests === 1 ? { ok: true, pending: true, deletion: "requested" } : { ok: true, pending: false }) });
    }
    if (url.pathname.startsWith("/api/")) { unexpected.push(url.pathname); return route.abort(); }
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: "<p>Deletion confirmed</p>" });
    return route.continue();
  });
  await page.goto(base + "/tests/deletion-harness.html");
  await page.getByRole("button", { name: "Delete my account", exact: true }).click();
  await page.getByPlaceholder("owner@example.invalid").fill("owner@example.invalid");
  await page.getByRole("button", { name: "Permanently delete", exact: true }).click();
  await page.getByRole("button", { name: "Permanently delete", exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/tests/deletion-harness.html", "Failure cannot redirect or fake completion");
  await page.getByRole("button", { name: "Permanently delete", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Deletion requested" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/tests/deletion-harness.html", "202 keeps the account completion flow open");
  assert.match(await page.getByRole("status").innerText(), /check and complete your account deletion/);
  assert.doesNotMatch(await page.locator("body").innerText(), /private-diagnostic|were deleted/);
  await page.getByRole("button", { name: "Check and complete deletion", exact: true }).click();
  await page.waitForURL(base + "/");
  await page.goto(base + "/tests/deletion-harness.html?meeting=1");
  const pending = page.getByRole('region', { name: 'Zoom deletion pending' });
  await pending.getByRole('button', { name: 'Check and complete deletion' }).click();
  await pending.getByRole('button', { name: 'Check and complete deletion' }).waitFor();
  assert.equal(await pending.count(), 1, '202 keeps the owner completion card without content');
  assert.equal(await pending.locator('video,a').count(), 0);
  await pending.getByRole('button', { name: 'Check and complete deletion' }).click();
  await pending.waitFor({ state: 'detached' }); assert.equal(meetingRequests, 2);
  assert.equal(requests, 3); assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  console.log("PASS: account failure stays open;202 retains completion flow and meeting card;200 alone finishes");
} finally { await browser.close(); }
