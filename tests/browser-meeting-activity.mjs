import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5194";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local fixtures only");
const css = (await readFile(new URL("./calendar-harness.html", import.meta.url), "utf8")).match(/<style>([\s\S]*?)<\/style>/)[1];
const extraCss = `ul{list-style:none;padding:0;margin:0}h2{margin:0}.flex-col{flex-direction:column}.break-words{overflow-wrap:break-word}.min-h-11{min-height:2.75rem}.self-start{align-self:flex-start}.max-w-prose{max-width:65ch}.text-xs{font-size:12px}.leading-relaxed{line-height:1.625}.mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mt-4{margin-top:1rem}.my-4{margin-block:1rem}.border-amber-200{border-color:#fde68a}.bg-amber-50{background:#fffbeb}.text-amber-900{color:#78350f}.border-violet-200{border-color:#ddd6fe}.divide-amber-200>*+*{border-top:1px solid #fde68a}.opacity-0{opacity:0}.pointer-events-none{pointer-events:none}.w-72{width:18rem}.border-slate-300{border-color:#cbd5e1}.bg-violet-50{background:#f5f3ff}.border-cyan-100{border-color:#cffafe}[class~="grid-cols-[1.4fr_1fr_0.9fr_0.8fr_0.5fr_40px]"]{grid-template-columns:1.4fr 1fr .9fr .8fr .5fr 40px}@media(min-width:640px){[class~="sm:flex-row"]{flex-direction:row}[class~="sm:items-center"]{align-items:center}}`;
await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "msedge", headless: true });
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "en-US" });
    const page = await context.newPage();
    const errors = [], unexpected = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) { unexpected.push(url.href); return route.abort(); }
      if (url.pathname === "/tests/meeting-activity-harness.html") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n${extraCss}</style><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/tests/meeting-activity-harness.jsx"></script></body></html>` });
      if (url.pathname === "/api/settings") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ sharing_prefs: { autoRecap: false } }) });
      if (url.pathname.startsWith("/api/")) { unexpected.push(url.pathname); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${base}/tests/meeting-activity-harness.html`);
    const activity = page.getByRole("region", { name: "Meetings that could not be completed" });
    await activity.waitFor({ timeout: 10000 }).catch(error => { throw new Error(`${error.message}; fixture errors: ${errors.join(" | ")}`); });
    assert.match(await activity.innerText(), /OctoMeet 11:50[\s\S]*did not start recording/);
    assert.equal(await activity.getByRole("link", { name: "View saved recording" }).getAttribute("href"), "/api/media/fixture.mp4");
    assert.doesNotMatch(await activity.innerText(), /private-token-fixture|fixture\.invalid/);
    assert.equal(await activity.getByRole("listitem").count(), 3);
    await activity.getByRole("button", { name: "Show all 4" }).click();
    assert.equal(await activity.getByRole("listitem").count(), 4);
    await activity.getByRole("button", { name: "Show fewer" }).click();
    assert.match(await page.getByRole("status").innerText(), /Processing “Processing meeting fixture”/);
    assert.equal(await page.getByRole("status").getByRole("link", { name: "View saved recording" }).getAttribute("href"), "/api/media/processing-fixture.mp4");
    assert.doesNotMatch(await page.getByRole("status").innerText(), /Generating|AI report/);
    await page.getByRole("button", { name: "Load delayed fixture" }).click();
    assert.match(await page.getByRole("status").innerText(), /Processing meeting fixture.*taking longer/);
    assert.equal(await page.getByRole("status").locator(".animate-spin").count(), 0);
    const regionBox = await activity.boundingBox();
    assert.ok(regionBox.x >= 0 && regionBox.x + regionBox.width <= width + 1, "Failure activity fits its viewport");
    await activity.screenshot({ path: `test-results/meeting-activity-${width}.png` });
    const search = page.getByPlaceholder("Search meeting, company or person…");
    await search.fill("OctoMeet 11:50");
    assert.equal(await activity.getByRole("listitem").count(), 1);
    assert.equal(await page.getByRole("button", { name: /Completed report fixture/ }).count(), 0);
    await search.fill("Completed report fixture");
    assert.equal(await activity.count(), 0);
    await page.getByRole("button", { name: /Completed report fixture/ }).waitFor();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    assert.equal(await page.evaluate(() => window.activityRefreshes), 1);
    assert.equal(await search.inputValue(), "Completed report fixture", "Refresh preserves filters");
    assert.deepEqual(await page.evaluate(() => window.activityOpened), [], "Failed captures do not open fake reports");
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, [], "No provider, media or unmocked API request is made");
    console.log(`PASS ${width}: failed visibility, safe saved-media link, no diagnostic leak, expand, search, completed report preservation, processing identity/delay and refresh`);
    await context.close();
  }
} finally { await browser.close(); }
