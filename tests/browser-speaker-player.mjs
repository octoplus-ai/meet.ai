import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5193";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "msedge", headless: true });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], unexpected = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (/\/tests\/(main|camera)-fixture\.mp4$/.test(url.pathname)) return route.fulfill({ status: 204 });
    if (url.origin !== base || url.pathname.startsWith("/api/")) { unexpected.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.addInitScript(() => {
    const times = new WeakMap(), paused = new WeakMap(), ready = new WeakMap();
    window.speakerFixtureEvents = [];
    Object.defineProperties(HTMLMediaElement.prototype, {
      duration: { get: () => 120 },
      readyState: { get() { return ready.get(this) ?? 4; } },
      paused: { get() { return paused.get(this) ?? true; } },
      currentTime: { get() { return times.get(this) || 0; }, set(value) { times.set(this, value); } },
    });
    Object.defineProperties(HTMLVideoElement.prototype, { videoWidth: { get: () => 640 }, videoHeight: { get: () => 360 } });
    HTMLMediaElement.prototype.play = function () { paused.set(this, false); this.dispatchEvent(new Event("play")); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { paused.set(this, true); this.dispatchEvent(new Event("pause")); };
    window.cameraSetUnready = (video) => ready.set(video, 0);
    window.cameraSetReady = (video) => { ready.set(video, 4); video.dispatchEvent(new Event("loadeddata")); };
  });
  await page.goto(`${base}/tests/speaker-player-harness.html`);
  await page.locator("video").first().evaluate((video) => video.dispatchEvent(new Event("loadedmetadata")));
  const button = page.getByRole("button", { name: "Speaker camera", exact: true });
  assert.equal(await button.getAttribute("aria-pressed"), "false");
  await button.click();
  await page.getByText("Camera capture was disabled for this meeting.", { exact: true }).waitFor();
  // A real self-contained WebM avoids native decoder errors from an empty mock
  // response. The timeline/readiness above remain controlled for deterministic UI tests.
  const cameraUrl = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext("2d"); context.fillStyle = "#7c3aed"; context.fillRect(0, 0, 160, 90);
    const stream = canvas.captureStream(12), chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
    const timer = setInterval(() => { context.fillStyle = `hsl(${performance.now() % 360} 80% 50%)`; context.fillRect(0, 0, 160, 90); }, 40);
    recorder.start(); await new Promise((resolve) => setTimeout(resolve, 2200)); recorder.stop(); await stopped;
    clearInterval(timer); stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(chunks, { type: "video/webm" });
    if (blob.size < 100) throw new Error("Synthetic video did not produce frames");
    return URL.createObjectURL(blob);
  });
  const validMedia = { pipUrl: cameraUrl, pipStatus: "partial", shareIntervals: [[10, 100]], pipIntervals: [[20, 40], [60, 90]], pipTimeline: [{ t: 10, state: "camera_off", name: "Test" }, { t: 20, state: "camera", name: "Test" }] };
  await page.evaluate((media) => window.setSpeakerFixture(media), validMedia);
  await page.waitForFunction(() => document.querySelector('[aria-label="Speaker camera"]').getAttribute("aria-pressed") === "false");
  await button.click();
  await page.getByText("The camera appears while someone shares their screen.", { exact: true }).waitFor();
  await page.evaluate(() => window.seekSpeakerFixture(15));
  await page.getByText("The speaker's camera was off at this moment.", { exact: true }).waitFor();
  await page.evaluate(() => window.seekSpeakerFixture(30));
  const overlay = page.getByTestId("speaker-overlay");
  await page.waitForFunction(() => document.querySelector('[data-testid="speaker-overlay"]')?.getAttribute("aria-hidden") === "false");
  assert.equal(await overlay.locator("video").getAttribute("preload"), "auto");
  async function dragCamera() {
    const before = await overlay.boundingBox();
    const hit = await overlay.evaluate((node) => { const b = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); });
    assert.equal(hit, true, "Actual player overlays must not intercept camera dragging");
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down(); await page.mouse.move(before.x + before.width / 2 - 80, before.y + before.height / 2 - 20, { steps: 6 }); await page.mouse.up();
    const after = await overlay.boundingBox(); assert.ok(after.x < before.x - 20, "Camera moved");
  }
  await dragCamera(); // Actual paused playback menu is mounted: verifies z-index integration.
  await page.evaluate(() => window.playSpeakerFixture());
  await dragCamera();
  console.log("PASS: real MeetingVideo camera drags while paused and while playing; no parent overlay intercepts it");
  await page.getByTitle("Collapse video", { exact: true }).click();
  assert.equal(await overlay.count(), 0);
  await page.evaluate(() => window.seekSpeakerFixture(70));
  await page.getByTitle("Expand Video", { exact: true }).click();
  await page.waitForFunction(() => {
    const overlay = document.querySelector('[data-testid="speaker-overlay"]');
    return overlay?.getAttribute("aria-hidden") === "false" && Math.abs(overlay.querySelector("video").currentTime - 70) < .2;
  });
  await overlay.focus(); const position = await overlay.boundingBox(); await overlay.press("ArrowLeft");
  assert.ok((await overlay.boundingBox()).x < position.x);
  await page.evaluate(() => window.seekSpeakerFixture(50));
  await page.waitForFunction(() => document.querySelector('[data-testid="speaker-overlay"]').getAttribute("aria-hidden") === "true");
  await page.getByText("No visible speaker camera was captured at this moment.", { exact: true }).waitFor();
  console.log("PASS: remount rebinds the camera; keyboard movement and genuine coverage gaps work");
  await page.evaluate(() => window.seekSpeakerFixture(70));
  await overlay.locator("video").evaluate((video) => video.dispatchEvent(new Event("error")));
  await page.getByRole("button", { name: "Retry camera", exact: true }).waitFor();
  await page.getByRole("button", { name: "Retry camera", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="speaker-overlay"]').getAttribute("aria-hidden") === "false");
  console.log("PASS: load failure is visible and retry replaces/rebinds the actual camera element");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await overlay.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
  }
  await page.evaluate((pipUrl) => window.setSpeakerFixture({ pipUrl, shareIntervals: [[0, 120]] }), cameraUrl);
  await page.getByText(/Older recording: camera coverage is unverified/).waitFor();
  await button.click(); assert.equal(await overlay.count(), 0);
  await page.evaluate(() => window.setSpeakerFixture({ pipStatus: "unavailable", pipIntervals: [], shareIntervals: [] }));
  await page.waitForFunction(() => document.querySelector('[aria-label="Speaker camera"]').getAttribute("aria-pressed") === "false");
  await button.click();
  await page.getByText("No screen sharing was recorded in this meeting.", { exact: true }).waitFor();
  assert.equal(await overlay.count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  console.log("PASS: responsive positioning, optional off, honest legacy warning and no-share status; no real providers called");
} catch (error) {
  if (page) console.error("Local fixture state:", await page.evaluate(() => ({
    status: [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent),
    videos: [...document.querySelectorAll("video")].map((video) => ({ time: video.currentTime, ready: video.readyState, error: video.error?.message || null })),
  })).catch(() => null));
  throw error;
} finally { await browser.close(); }
