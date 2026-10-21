import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import { mkdir } from "node:fs/promises";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5193";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local synthetic test only");
await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ ...(process.env.TEST_BROWSER === "chromium" ? {} : { channel: process.env.TEST_BROWSER || "msedge" }), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], unexpectedRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("-camera-must-not-load")) { unexpectedRequests.push(url.pathname); return route.abort(); }
    if (url.pathname === "/tests/timeline-fixture.webm") return route.fulfill({ status: 204 });
    if (url.origin !== base || url.pathname.startsWith("/api/")) {
      unexpectedRequests.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  // Synthetic media contract: test real React/browser pointer, focus and seek wiring
  // without downloading a private recording or depending on decoding/buffering timing.
  await page.addInitScript(() => {
    const times = new WeakMap();
    window.timelineMediaEvents = [];
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { get: () => 120 });
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      get() { return times.get(this) || 0; },
      set(time) { times.set(this, time); window.timelineMediaEvents.push({ kind: "seek", preview: this.muted, time }); },
    });
    HTMLMediaElement.prototype.play = function () {
      window.timelineMediaEvents.push({ kind: "play", preview: this.muted });
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event("pause")); };
  });
  await page.goto(`${base}/tests/timeline-harness.html`);
  const mainVideo = page.locator("video").first();
  await mainVideo.evaluate((video) => video.dispatchEvent(new Event("loadedmetadata")));
  const marker = page.getByRole("button", { name: "Se aprobó la propuesta para la próxima etapa del proyecto", exact: true });
  await marker.waitFor();
  async function assertNoPresenter() {
    assert.equal(await page.getByRole("button", { name: /Speaker camera|Presenter Screen|Cámara del hablante|Pantalla del presentador/i }).count(), 0);
    assert.equal(await page.getByTestId("speaker-overlay").count(), 0);
    assert.equal(await page.locator('video[src*="legacy-camera"], video[src*="modern-camera"]').count(), 0);
  }
  await assertNoPresenter();
  await page.evaluate(() => window.setPresenterFixture("modern"));
  await page.locator('[data-fixture-mode="modern"]').waitFor();
  await assertNoPresenter();
  console.log("PASS: Presenter Screen has no button, popup or camera media even with legacy and modern metadata");
  const bar = marker.locator("..");
  const preview = page.locator("video").nth(1).locator("..");
  const tooltip = page.getByRole("tooltip");
  const previewState = () => preview.evaluate((node) => {
    const style = getComputedStyle(node);
    return { visibility: style.visibility, opacity: Number(style.opacity) };
  });
  async function moveOnBar(track = bar) {
    const box = await track.boundingBox();
    await page.mouse.move(box.x + box.width * 0.37, box.y + box.height - 2);
  }
  async function assertPreviewHidden() {
    assert.equal((await previewState()).visibility, "hidden", "Thumbnail must hide immediately, without a fade covering marker text");
    assert.equal(await preview.getAttribute("aria-hidden"), "true");
  }
  async function assertPreviewVisible() {
    await page.waitForFunction(() => {
      const style = getComputedStyle(document.querySelectorAll("video")[1].parentElement);
      return style.visibility === "visible" && Number(style.opacity) === 1;
    });
    assert.equal(await tooltip.count(), 0);
  }

  await moveOnBar();
  await assertPreviewVisible();
  await marker.hover();
  await assertPreviewHidden(); // Fails on the original overlapping-thumbnail bug.
  assert.match(await tooltip.innerText(), /Se aprobó la propuesta/);
  assert.equal(await tooltip.locator("video,canvas,img,picture,iframe").count(), 0, "Marker tooltip is text only");
  for (const name of [
    "Inicio de la reunión: objetivos y presentación del proyecto",
    "¿Cuándo comienza la siguiente etapa?",
    "Preparar el cronograma y compartirlo con el equipo",
  ]) {
    await moveOnBar(); await assertPreviewVisible();
    await page.getByRole("button", { name, exact: true }).hover();
    await assertPreviewHidden();
    assert.ok((await tooltip.innerText()).includes(name));
    assert.equal(await tooltip.locator("video,canvas,img,picture,iframe").count(), 0);
  }
  await marker.hover();
  const previewSeeks = () => page.evaluate(() => window.timelineMediaEvents.filter((e) => e.kind === "seek" && e.preview).length);
  const before = await previewSeeks();
  const dot = await marker.boundingBox();
  await page.mouse.move(dot.x + dot.width / 2 + 1, dot.y + dot.height / 2);
  await assertPreviewHidden();
  assert.equal(await previewSeeks(), before, "Moving inside a marker must not seek the preview video");
  await moveOnBar();
  await assertPreviewVisible();
  await page.getByRole("heading").hover();
  await assertPreviewHidden();
  console.log("PASS: free timeline → marker text → free timeline → outside, with no overlapping video or unnecessary seeks");

  await page.getByTitle("Settings (playback speed & overlays)", { exact: true }).click();
  await page.getByText("Show metrics on screen", { exact: true }).locator("..").getByRole("button").click();
  // Dismiss via the existing backdrop, outside the settings popover.
  await page.mouse.click(2, 2);
  await marker.hover();
  assert.match(await tooltip.innerText(), /Se aprobó la propuesta/);
  await assertPreviewHidden();
  console.log("PASS: marker text remains available with metrics disabled");

  await moveOnBar();
  await assertPreviewVisible();
  await marker.focus();
  assert.equal(await marker.getAttribute("aria-describedby"), await tooltip.getAttribute("id"));
  await assertPreviewHidden();
  await marker.press("Escape");
  assert.equal(await tooltip.count(), 0);
  await marker.press("Tab");
  assert.match(await tooltip.innerText(), /¿Cuándo comienza/);
  await assertPreviewHidden();
  await marker.focus();
  await page.evaluate(() => { window.timelineMediaEvents = []; });
  await marker.press("Enter");
  assert.deepEqual(await page.evaluate(() => window.timelineMediaEvents.filter((e) => !e.preview)), [
    { kind: "seek", preview: false, time: 30 }, { kind: "play", preview: false },
  ], "Marker activation seeks exactly once to its timestamp and plays");
  await page.getByRole("button", { name: "Outside player", exact: true }).focus();
  assert.equal(await tooltip.count(), 0);
  console.log("PASS: keyboard focus exposes the tooltip; Escape dismisses; activation preserves exact seek/play behavior");

  await page.evaluate(() => { window.timelineMediaEvents = []; });
  await marker.click();
  assert.deepEqual(await page.evaluate(() => window.timelineMediaEvents.filter((e) => !e.preview)), [
    { kind: "seek", preview: false, time: 30 }, { kind: "play", preview: false },
  ], "Pointer click must not bubble into an extra bar seek");
  await moveOnBar();
  await assertPreviewVisible(); // Mouse focus left by the click must not trap the tooltip.
  const trackBox = await bar.boundingBox();
  await page.mouse.click(trackBox.x + trackBox.width * 0.37, trackBox.y + trackBox.height - 2);
  assert.ok(Math.abs(await mainVideo.evaluate((video) => video.currentTime) - 44.4) < 0.2, "Free bar click still seeks proportionally");
  console.log("PASS: pointer marker click seeks once; returning to the free bar restores preview and proportional seeking");

  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["Inicio de la reunión: objetivos y presentación del proyecto", "Cierre de la reunión: próximos pasos, responsables y fechas de entrega"]) {
      await page.getByRole("button", { name, exact: true }).hover();
      await assertPreviewHidden();
      const tipBox = await tooltip.boundingBox();
      const playerBox = await mainVideo.locator("..").boundingBox();
      assert.ok(tipBox.x >= playerBox.x && tipBox.x + tipBox.width <= playerBox.x + playerBox.width, "Edge marker tooltip stays inside the player");
    }
    await page.screenshot({ path: `test-results/timeline-${width}.png` });
  }
  console.log("PASS: long marker text stays within the player at 360, 768 and 1280 px");

  await mainVideo.evaluate((video) => video.pause());
  await page.getByRole("button", { name: /^Trailer / }).click();
  assert.equal(await marker.count(), 0);
  assert.equal(await tooltip.count(), 0);
  const trailerBar = preview.locator("..").locator(":scope > .cursor-pointer");
  await moveOnBar(trailerBar);
  await assertPreviewVisible();
  await page.getByRole("heading").hover();
  await assertPreviewHidden();
  console.log("PASS: Trailer retains its marker-free timeline and hover preview");
  await assertNoPresenter();
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedRequests, [], "Fixture never calls production APIs or external providers");
} finally { await browser.close(); }
