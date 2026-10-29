import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5194";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local fixtures only");
const css = (await readFile(new URL("./calendar-harness.html", import.meta.url), "utf8")).match(/<style>([\s\S]*?)<\/style>/)[1];
const extraCss = ".min-h-11{min-height:44px}.h-10{height:40px}.w-10{width:40px}.mt-1{margin-top:4px}.mt-2{margin-top:8px}.mt-4{margin-top:16px}.text-xs{font-size:12px}.leading-relaxed{line-height:1.625}.break-words{overflow-wrap:break-word}.max-w-prose{max-width:65ch}.text-amber-900{color:#78350f}.bg-amber-50{background:#fffbeb}.text-emerald-700{color:#047857}.border-slate-300{border-color:#cbd5e1}.text-amber-700{color:#b45309}h3{margin:0}";
const normal = { configured: true, connected: true, rtmsConfigured: true, captureMode: "native_rtms", capabilities: { audio: true, video: true, screenshare: true, transcript: false }, email: "member@example.test" };
await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "msedge", headless: true });
try {
  for (const width of [360, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    let current = { ...normal, configured: false, connected: false, rtmsConfigured: false };
    let statusCode = 200, failDisconnect = true, disconnectCalls = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) { unexpected.push(url.origin); return route.abort(); }
      if (url.pathname === "/tests/zoom-connection-harness.html") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}${extraCss}</style><script>window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="/tests/zoom-connection-harness.jsx"></script></body></html>` });
      if (url.pathname === "/api/zoom/status") return route.fulfill({ status: statusCode, contentType: "application/json", body: JSON.stringify(current) });
      if (url.pathname === "/api/zoom/disconnect") {
        disconnectCalls++;
        assert.equal(route.request().method(), "POST");
        assert.equal(route.request().headers()["content-type"], "application/json");
        assert.deepEqual(route.request().postDataJSON(), {});
        if (failDisconnect) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "private-fixture-token" }) });
        current = { ...normal, connected: false };
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, connected: false }) });
      }
      if (url.pathname.startsWith("/api/")) { unexpected.push(url.pathname); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${base}/tests/zoom-connection-harness.html?zoom=connected&keep=fixture`);
    const panel = page.getByRole("region", { name: "Zoom", exact: true });
    await panel.getByText("Setup pending", { exact: true }).waitFor({ timeout: 10000 }).catch(async failure => { throw new Error(`${failure.message}; errors=${errors.join(" | ")}; fixture=${await page.locator("body").innerText()}`); });
    assert.equal(await panel.getByRole("link", { name: "Connect Zoom", exact: true }).count(), 0);
    assert.equal(new URL(page.url()).search, "?keep=fixture", "Only callback fields are removed");
    current = { ...normal, connected: false };
    await panel.getByRole("button", { name: "Refresh status" }).click();
    await panel.getByText("Not connected", { exact: true }).waitFor();
    assert.equal(await panel.getByRole("link", { name: "Connect Zoom", exact: true }).getAttribute("href"), "/api/auth/zoom/start");
    current = { ...normal, capabilities: { ...normal.capabilities, screenshare: false } };
    await panel.getByRole("button", { name: "Refresh status" }).click();
    await panel.getByText("Authorization needs updating").waitFor();
    assert.equal(await panel.getByRole("link", { name: "Reconnect Zoom" }).count(), 1);
    assert.equal(await panel.getByText("Granted permissions: audio, video", { exact: true }).count(), 1);
    current = { ...normal, rtmsConfigured: false };
    await panel.getByRole("button", { name: "Refresh status" }).click();
    await panel.getByText("Account connected · recording setup pending", { exact: true }).waitFor();
    assert.equal(await panel.getByRole("link", { name: "Set up auto-start in Zoom" }).count(), 0);
    current = normal;
    await panel.getByRole("button", { name: "Refresh status" }).click();
    await panel.getByText("Account connected", { exact: true }).waitFor();
    assert.match(await panel.innerText(), /Zoom and the host must allow content access/);
    assert.match(await panel.innerText(), /does not confirm that a meeting is being recorded/);
    assert.equal(await panel.getByText("Granted permissions: audio, video, screen sharing", { exact: true }).count(), 1);
    assert.equal(await panel.getByText("OctoMeet transcribes the captured audio.", { exact: true }).count(), 1);
    await panel.getByRole("button", { name: "Disconnect Zoom", exact: true }).click();
    await panel.getByRole("alert").waitFor();
    assert.equal(await panel.getByText("member@example.test", { exact: true }).count(), 1, "Failure does not fake successful disconnection");
    assert.doesNotMatch(await panel.innerText(), /private-fixture-token|Zoom disconnected from/);
    failDisconnect = false;
    await panel.getByRole("button", { name: "Disconnect Zoom", exact: true }).click();
    await panel.getByText("Zoom disconnected from OctoMeet.", { exact: true }).waitFor();
    assert.equal(await panel.getByText("member@example.test", { exact: true }).count(), 0);
    assert.equal(await panel.getByRole("button", { name: "Disconnect Zoom", exact: true }).count(), 0);
    assert.equal(disconnectCalls, 2);
    current = { error: "private-provider-error" }; statusCode = 503;
    await panel.getByRole("button", { name: "Refresh status" }).click();
    await panel.getByRole("alert").waitFor();
    assert.doesNotMatch(await panel.innerText(), /private-provider-error/);
    current = normal; statusCode = 200;
    await panel.getByRole("button", { name: "Refresh status" }).click();
    await panel.getByText("Account connected", { exact: true }).waitFor();
    assert.doesNotMatch(await panel.innerText(), /Zoom disconnected from OctoMeet/);
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, "Connection panel fits viewport");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(unexpected, [], "No Zoom site or unmocked API is contacted");
    assert.deepEqual(errors, []);
    await panel.screenshot({ path: `test-results/zoom-connection-${width}.png` });
    await page.goto(`${base}/tests/zoom-connection-harness.html?lang=es&zoom_error=private-token-fixture`);
    await panel.getByText("Cuenta conectada", { exact: true }).waitFor();
    assert.equal(await panel.getByText("Permisos otorgados: audio, video, pantalla compartida", { exact: true }).count(), 1);
    assert.match(await panel.getByRole("alert").innerText(), /No pudimos comprobar/);
    assert.doesNotMatch(await panel.innerText(), /private-token-fixture/);
    assert.equal(new URL(page.url()).search, "?lang=es");
    await panel.getByRole("button", { name: "Actualizar estado" }).click();
    await panel.getByText("Cuenta conectada", { exact: true }).waitFor();
    assert.equal(await panel.getByRole("alert").count(), 0, "Refresh clears an obsolete callback error");
    console.log(`PASS ${width}: config, OAuth link, grant, RTMS readiness, confirmed disconnect, safe error and responsive panel`);
    await context.close();
  }
} finally { await browser.close(); }
