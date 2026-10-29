import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5193";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Local fixtures only");
await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
const now = new Date(), day = Math.min(now.getDate() + 1, 18);
const meeting = (id, title, offset, extra) => ({
  id, title, start: new Date(now.getFullYear(), now.getMonth(), day + offset, 11).toISOString(),
  end: new Date(now.getFullYear(), now.getMonth(), day + offset, 11, 30).toISOString(),
  attendees: 2, organizer: "host@external.example.test", botAvailable: true,
  botUnavailableReason: null, botEnabled: false, botStatus: null, autoJoinEligible: true, ...extra,
});
const events = [
  meeting("teams-disabled", "Teams disabled", 0, { meetingUrl: "https://teams.microsoft.com/meet/1234567890123?p=fixture", botAvailable: false, botUnavailableReason: "platform_disabled", autoJoinEligible: false }),
  meeting("zoom-scheduled", "Zoom scheduled", 1, { meetingUrl: "https://zoom.us/j/12345678901?pwd=fixture", botEnabled: true, botStatus: "scheduled" }),
  meeting("meet-pending", "Meet unlinked", 2, { meetingUrl: "https://meet.google.com/abc-defg-hij" }),
  meeting("manual-skipped", "Manual skipped", 3, { meetingUrl: "https://meet.google.com/xyz-abcd-efg", botStatus: "skipped" }),
  meeting("zoom-rtms", "Zoom native capture", 4, { meetingUrl: "https://zoom.us/j/12345678902", captureMode: "zoom_rtms", botStatus: "skipped", autoJoinEligible: false }),
  meeting("zoom-rtms-recording", "Zoom recording", 5, { meetingUrl: "https://zoom.us/j/12345678903", captureMode: "zoom_rtms", botStatus: "recording", botEnabled: true }),
  meeting("zoom-rtms-disconnected", "Zoom disconnected", 6, { meetingUrl: "https://zoom.us/j/12345678904", captureMode: "zoom_rtms", botAvailable: false, botUnavailableReason: "zoom_not_connected", autoJoinEligible: false }),
];

const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "msedge", headless: true });
try {
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "en-US" });
    const page = await context.newPage();
    await page.clock.install();
    const errors = [], unexpected = [], requests = [];
    let currentEvents = events.map(event => ({ ...event }));
    let mode = "fail", releaseAck, signalPending;
    page.on("pageerror", error => errors.push(error.message));
    const reply = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) { unexpected.push(url.href); return route.abort(); }
      if (url.pathname === "/api/calendar/events") return reply(route, 200, { events: currentEvents });
      if (url.pathname === "/api/settings") return reply(route, 200, { auto_join: true, recall_connected: false });
      if (url.pathname === "/api/calendar/arm-all") return reply(route, 200, { armed: 0 });
      if (url.pathname === "/api/event-bot") {
        assert.equal(route.request().method(), "POST");
        const body = route.request().postDataJSON(); requests.push(body);
        if (mode === "rtms" && body.eventId === "zoom-rtms") {
          currentEvents = currentEvents.map(event => event.id !== body.eventId ? event : { ...event, botEnabled: body.enable, botStatus: body.enable ? "scheduled" : "skipped", awaitingAuthorization: body.enable });
          return reply(route, 200, { ok: true, enabled: body.enable, mode: "zoom_rtms", captureMode: "zoom_rtms", awaitingAuthorization: body.enable });
        }
        if (mode === "delayed" && body.enable) {
          await new Promise(resolve => { releaseAck = resolve; signalPending?.(); });
          return reply(route, 200, { ok: true, enabled: true });
        }
        return reply(route, 503, { ok: false, enabled: false, error: "bot_backend_unavailable" });
      }
      if (url.pathname.startsWith("/api/")) { unexpected.push(url.pathname); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${base}/tests/calendar-harness.html`);
    const row = id => page.locator(`[data-calendar-event="${id}"]`);
    const toggle = title => page.getByRole("switch", { name: `OctoMeet for ${title}`, exact: true });
    await row("manual-skipped").waitFor().catch(async error => { console.error({ errors, unexpected, text: await page.locator("body").innerText() }); throw error; });
    const adapted = await page.evaluate(() => {
      const row = window.adaptCalendarMeeting({ id: "rtms-fixture", status: "done", capture_mode: "zoom_rtms", recording_url: "https://media.example.test/zoom.mp4", bot_id: null });
      const pending = window.adaptCalendarMeeting({ id: "rtms-pending", status: "scheduled", capture_mode: "zoom_rtms" });
      return { video: row.video, captureMode: row.captureMode, pendingVideo: pending.video, pendingSummary: pending.summary };
    });
    assert.equal(adapted.video, "https://media.example.test/zoom.mp4");
    assert.equal(adapted.captureMode, "zoom_rtms");
    assert.equal(adapted.pendingVideo, null);
    assert.match(adapted.pendingSummary, /Join with your connected Zoom account/);
    async function state(title, checked, disabled) {
      const control = toggle(title);
      assert.equal(await control.getAttribute("aria-checked"), String(checked));
      assert.equal(await control.isDisabled(), disabled);
    }
    await state("Teams disabled", false, true);
    assert.match(await row("teams-disabled").innerText(), /Bot not enabled for this platform/);
    console.log(`PASS ${width}: Teams unavailable is disabled and OFF`);
    await state("Zoom scheduled", true, false);
    assert.match(await row("zoom-scheduled").innerText(), /Bot scheduled/);
    console.log(`PASS ${width}: confirmed Zoom is ON`);
    await state("Meet unlinked", false, false);
    assert.match(await row("meet-pending").innerText(), /Pending auto-join/);
    console.log(`PASS ${width}: unlinked Meet stays OFF while auto-join is pending`);
    await state("Manual skipped", false, false);
    assert.equal(await row("manual-skipped").getByRole("status").innerText(), "Off");
    console.log(`PASS ${width}: manual skipped stays OFF`);
    await state("Zoom native capture", false, false);
    await state("Zoom recording", true, true);
    assert.match(await row("zoom-rtms-recording").innerText(), /Recording/);
    await state("Zoom disconnected", false, true);
    assert.match(await row("zoom-rtms-disconnected").innerText(), /Connect Zoom in Integrations/);
    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(layout.scrollWidth <= layout.width, `List overflows horizontally: ${JSON.stringify(layout)}`);
    // Capture initial state with honest local CSS at each requested viewport.
    await page.screenshot({ path: `test-results/calendar-${width}.png`, fullPage: true });

    async function rejectedToggle(title) {
      const completed = page.waitForResponse(response => response.url().endsWith("/api/event-bot") && response.status() === 503);
      await toggle(title).click(); await completed;
      await page.waitForFunction(name => !document.querySelector(`[aria-label="OctoMeet for ${name}"]`).disabled, title);
    }
    await rejectedToggle("Meet unlinked"); await state("Meet unlinked", false, false);
    console.log(`PASS ${width}: scheduler HTTP 503 does not switch ON`);

    mode = "delayed";
    const pending = new Promise(resolve => { signalPending = resolve; });
    await toggle("Meet unlinked").click(); await pending;
    await state("Meet unlinked", false, true);
    assert.match(await row("meet-pending").innerText(), /Updating/);
    releaseAck();
    await page.waitForFunction(() => document.querySelector('[aria-label="OctoMeet for Meet unlinked"]').getAttribute("aria-checked") === "true");
    await state("Meet unlinked", true, false);
    console.log(`PASS ${width}: pending request is disabled/OFF, then acknowledged success turns ON`);

    mode = "fail";
    await rejectedToggle("Zoom scheduled"); await state("Zoom scheduled", true, false);
    console.log(`PASS ${width}: failed disarm preserves ON`);

    mode = "rtms";
    await toggle("Zoom native capture").click();
    await page.waitForFunction(() => document.querySelector('[aria-label="OctoMeet for Zoom native capture"]').getAttribute("aria-checked") === "true");
    await state("Zoom native capture", true, false);
    assert.match(await row("zoom-rtms").innerText(), /Awaiting Zoom authorization/);
    assert.doesNotMatch(await row("zoom-rtms").innerText(), /Joining|Recording|Bot scheduled/);
    console.log(`PASS ${width}: native Zoom preparation waits for authorization and does not claim recording`);

    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await page.getByRole("button", { name: /Teams disabled/ }).click();
    await state("Teams disabled", false, true);
    assert.equal(await page.getByRole("status").innerText(), "Bot not enabled for this platform");
    await page.getByRole("button", { name: "Close event details", exact: true }).click();
    await page.getByRole("button", { name: /Zoom scheduled/ }).click();
    await state("Zoom scheduled", true, false);
    assert.equal(await page.getByRole("status").innerText(), "Bot scheduled");
    await page.getByRole("button", { name: "Close event details", exact: true }).click();
    await page.getByRole("button", { name: /Zoom native capture/ }).click();
    await state("Zoom native capture", true, false);
    assert.equal(await page.getByRole("status").innerText(), "Awaiting Zoom authorization");
    assert.match(await page.getByRole("dialog").innerText(), /connected Zoom account/);
    await page.getByRole("button", { name: "Close event details", exact: true }).click();
    await page.getByRole("button", { name: "List", exact: true }).click();
    currentEvents = currentEvents.map(event => event.id === "zoom-rtms" ? { ...event, botStatus: "recording", awaitingAuthorization: false } : event);
    const refreshed = page.waitForResponse(response => response.url().endsWith("/api/calendar/events"));
    await page.clock.fastForward(15001); await refreshed;
    await page.waitForFunction(() => document.querySelector('[data-calendar-event="zoom-rtms"]').innerText.includes("Recording"));
    await state("Zoom native capture", true, true);
    assert.doesNotMatch(await row("zoom-rtms").innerText(), /Awaiting Zoom authorization/);
    console.log(`PASS ${width}: only a refreshed recording state changes the badge to Recording`);
    console.log(`PASS ${width}: month popovers preserve Teams OFF/disabled and Zoom ON`);
    assert.deepEqual(requests.map(({ eventId, enable }) => ({ eventId, enable })), [
      { eventId: "meet-pending", enable: true }, { eventId: "meet-pending", enable: true }, { eventId: "zoom-scheduled", enable: false }, { eventId: "zoom-rtms", enable: true },
    ]);
    assert.deepEqual(await page.evaluate(() => window.calendarOpened), []);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, [], "No external or unmocked API requests");
    await context.close();
  }
  console.log("PASS: calendar state and native Zoom playback checks; screenshots use explicit offline utility CSS, not production Tailwind");
} finally { await browser.close(); }
