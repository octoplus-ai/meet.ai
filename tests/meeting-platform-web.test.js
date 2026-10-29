// Actual web handlers with in-memory DB/fetch boundaries. No credentials or real network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseMeetingUrl, extractMeetingUrl, enabledPlatforms, platformLabel, meetingLimitMinutes } from "../shared/meeting-platform.js";

const urls = {
  google_meet: "https://meet.google.com/abc-defg-hij",
  zoom: "https://us02web.zoom.us/j/12345678901?pwd=synthetic-code",
  teams: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_fixture%40thread.v2/0?context=%7B%22Tid%22%3A%22fixture%22%7D",
};
const source = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/export async function /g, "async function ")
  .replace("export default async function handler", "async function handler");
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; }, setHeader() {} });

function scheduler(options = {}) {
  const db = [], calls = [], annotations = [];
  let row = options.prior ? { ...options.prior } : null;
  const env = { BOT_ORCHESTRATOR_URL: "https://orchestrator.example.test/", APP_URL: "https://app.example.test", ...options.env };
  const context = vm.createContext({ Date, URL, encodeURIComponent, parseMeetingUrl, enabledPlatforms, meetingLimitMinutes,
    process: { env }, AbortSignal: options.AbortSignal || AbortSignal,
    recordingGate: async () => options.gate || { allow: true, maxMeetingMin: 120 },
    annotateEvent: async (...args) => { annotations.push(args); }, stopOrchestratorJob: async () => {},
    listUpcomingEvents: async () => ({ events: options.events || [], truncated: false, fetchedAt: Date.now() }),
    sb: async (query, request = {}) => {
      db.push({ query, ...request });
      if (query === "meetings" && request.method === "POST") { row = { id: "fixture-new", ...request.body }; return [row]; }
      if (query.startsWith("meetings?id=") && request.method === "PATCH") {
        if (options.failStateWrite && request.body.status === "error") throw new Error("synthetic DB failure");
        if (!query.includes("&status=in.") || ["scheduled", "joining"].includes(row?.status)) Object.assign(row, request.body);
        return [row];
      }
      if (query.includes("calendar_event_id=eq.")) return row ? [row] : [];
      if (query.includes("meeting_url=eq.")) return options.active ? [options.active] : [];
      if (query.includes("calendar_event_id=not.is.null")) return [];
      throw new Error("Unexpected mocked DB route");
    },
    fetch: async (url, request) => {
      assert.equal(url, "https://orchestrator.example.test/bots", "No provider fallback/outbound host is allowed");
      assert.equal(request.redirect, "error"); assert.ok(request.signal);
      calls.push(JSON.parse(request.body));
      if (options.heartbeatRace) row.status = "recording";
      if (options.networkError) throw options.networkError;
      const status = options.status || 202;
      return { ok: status >= 200 && status < 300, status, json: async () => options.body ?? { jobId: "fixture-job", state: "queued" } };
    },
  });
  vm.runInContext(source("../api/lib/schedule.js"), context);
  return { context, db, calls, annotations, get row() { return row; } };
}

test("Meet stays enabled by default and accepts production201/id and 202/jobId contracts", async () => {
  for (const options of [{ status: 201, body: { id: "fixture-job", state: "queued" } }, {}]) {
    const s = scheduler(options);
    const result = await s.context.scheduleBot("u", { meetingUrl: urls.google_meet });
    assert.equal(result.ok, true); assert.equal(result.mode, "inhouse");
    assert.equal(s.calls[0].platform, "google_meet"); assert.equal(s.row.stage_info.platform, "google_meet");
  }
});
test("Zoom/Teams are off by default before any DB write or bot request", async () => {
  for (const platform of ["zoom", "teams"]) {
    const s = scheduler(); const result = await s.context.scheduleBot("u", { meetingUrl: urls[platform] });
    assert.equal(result.error, "platform_disabled"); assert.equal(result.status, 409);
    assert.equal(s.db.length, 0); assert.equal(s.calls.length, 0);
  }
});
test("explicit rollout sends all three platforms through the own bot and preserves passcodes", async () => {
  for (const platform of Object.keys(urls)) {
    const s = scheduler({ env: { BOT_ENABLED_PLATFORMS: "google_meet,zoom,teams" } });
    const result = await s.context.scheduleBot("u", { meetingUrl: urls[platform] });
    assert.equal(result.ok, true); assert.equal(s.calls[0].platform, platform);
    assert.equal(s.calls[0].meetingUrl, parseMeetingUrl(urls[platform]).url);
    if (platform === "zoom") assert.equal(new URL(s.calls[0].meetingUrl).searchParams.get("pwd"), "synthetic-code");
  }
});
test("invalid URLs and invalid dates cannot allocate a meeting", async () => {
  for (const input of [{ meetingUrl: "not-a-url" }, { meetingUrl: "https://evil.example/?next=meet.google.com" }, { meetingUrl: urls.google_meet, joinAt: "not-a-date" }]) {
    const s = scheduler(); const result = await s.context.scheduleBot("u", input);
    assert.equal(result.status, 400); assert.equal(s.db.length, 0); assert.equal(s.calls.length, 0);
  }
});
test("the capture request never exceeds two hours without changing billing policy", async () => {
  const s = scheduler({ gate: { allow: true, maxMeetingMin: 240 } });
  assert.equal((await s.context.scheduleBot("u", { meetingUrl: urls.google_meet })).ok, true);
  assert.equal(s.calls[0].maxMeetingMin, 120);
});
test("missing own backend never falls back to Recall even when a Recall key exists", async () => {
  const s = scheduler({ env: { BOT_ORCHESTRATOR_URL: undefined, RECALL_API_KEY: "synthetic-not-a-real-key" } });
  const result = await s.context.scheduleBot("u", { meetingUrl: urls.google_meet });
  assert.equal(result.status, 503); assert.equal(result.error, "bot_backend_unavailable");
  assert.equal(s.db.length, 0); assert.equal(s.calls.length, 0);
  assert.equal((await s.context.syncRecallCalendar("u", "old-calendar")).disabled, "legacy_calendar_disabled");
  assert.equal(s.calls.length, 0);
});
test("HTTP400/503 are real failures, mark the row error and never annotate acceptance", async () => {
  for (const status of [400, 503]) for (const platform of ["zoom", "teams"]) {
    const s = scheduler({ env: { BOT_ENABLED_PLATFORMS: "google_meet,zoom,teams" }, status, body: { error: "raw-error-containing-pwd=synthetic-code" } });
    const result = await s.context.scheduleBot("u", { meetingUrl: urls[platform], calendarEventId: "e" });
    assert.equal(result.status, status); assert.notEqual(result.ok, true); assert.equal(result.error, "bot_dispatch_failed");
    assert.equal(s.row.status, "error"); assert.equal(s.annotations.length, 0);
    assert.ok(!JSON.stringify(result).includes("synthetic-code")); assert.ok(!s.row.error.includes("synthetic-code"));
  }
});
test("2xx invalid/negative acknowledgement is not acceptance", async () => {
  for (const body of [{}, { ok: false }, { ok: true }, { error: "synthetic-code" }, { id: "job", state: "failed" }]) {
    const s = scheduler({ body }); const result = await s.context.scheduleBot("u", { meetingUrl: urls.google_meet });
    assert.equal(result.status, 502); assert.equal(s.row.status, "error");
  }
});
test("timeout is bounded and returns 504, network errors 503, never success", async () => {
  for (const name of ["TimeoutError", "TypeError"]) {
    const error = Object.assign(new Error("synthetic private URL must not escape"), { name });
    const s = scheduler({ networkError: error, AbortSignal: { timeout(ms) { assert.equal(ms, 10000); return { aborted: name === "TimeoutError" }; } } });
    const result = await s.context.scheduleBot("u", { meetingUrl: urls.google_meet });
    assert.equal(result.status, name === "TimeoutError" ? 504 : 503); assert.equal(s.row.status, "error");
    assert.notEqual(result.ok, true); assert.ok(!JSON.stringify(result).includes("private URL"));
  }
});
test("failed dispatch cannot overwrite a recording heartbeat; failed DB patch still returns failure", async () => {
  const race = scheduler({ status: 503, heartbeatRace: true });
  assert.equal((await race.context.scheduleBot("u", { meetingUrl: urls.google_meet })).status, 503);
  assert.equal(race.row.status, "recording");
  const unavailable = scheduler({ status: 503, failStateWrite: true });
  const result = await unavailable.context.scheduleBot("u", { meetingUrl: urls.google_meet });
  assert.equal(result.state_update_failed, true); assert.notEqual(result.ok, true);
});
test("re-arm has the same error handling and preserves the original meeting identity", async () => {
  const prior = { id: "fixture-old", bot_id: "own_old", status: "error", start_time: "2020-01-01", status_synced_at: "2020-01-01", meeting_url: urls.google_meet };
  const s = scheduler({ status: 400, prior });
  const result = await s.context.scheduleBot("u", { meetingUrl: urls.google_meet, calendarEventId: "e", joinAt: new Date(Date.now() + 3600000).toISOString() });
  assert.equal(result.status, 400); assert.equal(s.row.id, "fixture-old"); assert.equal(s.row.status, "error");
  assert.equal(s.db.filter((request) => request.method === "POST").length, 0);
});
test("failed past event is not misleadingly returned as already armed", async () => {
  const s = scheduler({ prior: { id: "old", status: "error" } });
  const result = await s.context.scheduleBot("u", { meetingUrl: urls.google_meet, calendarEventId: "e" });
  assert.equal(result.error, "meeting_not_armed"); assert.notEqual(result.already, true);
});

test("calendar polling never retries host denial, authentication, CAPTCHA or policy barriers", async () => {
  const start = new Date(Date.now() + 3600000).toISOString();
  for (const error of ["AUTH_REQUIRED", "MEETING_DENIED", "CAPTCHA_REQUIRED", "POLICY_BLOCKED", "PASSCODE_REQUIRED", "PASSCODE_INVALID"]) {
    const prior = { id: "old", status: "error", error, meeting_url: urls.google_meet, start_time: start, status_synced_at: "2020-01-01" };
    const s = scheduler({ prior, events: [{ id: "e", meetingUrl: urls.google_meet, start }] });
    const result = await s.context.armUserCalendar("u");
    assert.equal(result.armed, 0); assert.equal(s.calls.length, 0); assert.equal(s.row.status, "error");
  }
});

test("a manual retry or corrected event can rearm a terminal failure within its meeting window", async () => {
  const start = new Date(Date.now() - 5 * 60000).toISOString();
  const prior = { id: "old", status: "error", error: "MEETING_DENIED", meeting_url: urls.google_meet, start_time: start, status_synced_at: new Date().toISOString() };
  const cases = [
    { meetingUrl: urls.google_meet, joinAt: start, manualRetry: true },
    { meetingUrl: "https://meet.google.com/xyz-abcd-efg", joinAt: start },
    { meetingUrl: urls.google_meet, joinAt: new Date(Date.now() + 3600000).toISOString() },
  ];
  for (const input of cases) {
    const s = scheduler({ prior }); const result = await s.context.scheduleBot("u", { calendarEventId: "e", ...input });
    assert.equal(result.ok, true); assert.equal(s.calls.length, 1); assert.equal(s.row.id, "old");
  }
  const expired = new Date(Date.now() - 3 * 3600000).toISOString();
  const s = scheduler({ prior: { ...prior, start_time: expired } });
  assert.equal((await s.context.scheduleBot("u", { meetingUrl: urls.google_meet, calendarEventId: "e", joinAt: expired, manualRetry: true })).error, "meeting_not_armed");
  assert.equal(s.calls.length, 0);
});

test("manual retry never starts another bot for an in-call, recording or processing meeting", async () => {
  for (const status of ["in_call", "recording", "processing"]) {
    const start = new Date(Date.now() - 5 * 60000).toISOString();
    const s = scheduler({ prior: { id: "live", status, meeting_url: urls.google_meet, start_time: start } });
    const result = await s.context.scheduleBot("u", { meetingUrl: urls.google_meet, calendarEventId: "e", joinAt: start, manualRetry: true });
    assert.equal(result.already, true); assert.equal(s.calls.length, 0); assert.equal(s.db.filter(call => call.method === "PATCH" || call.method === "POST").length, 0);
  }
});

const calendarItems = [
  { id: "meet", hangoutLink: urls.google_meet },
  { id: "zoom", description: `Join: ${urls.zoom}` },
  { id: "teams", location: urls.teams },
  { id: "phone-first", conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:+10000000000" }, { entryPointType: "video", uri: urls.teams }] } },
];
test("auto-join calendar helper extracts all three platforms with the shared parser", async () => {
  const context = vm.createContext({ Date, URLSearchParams, encodeURIComponent, extractMeetingUrl,
    sb: async () => [{ access_token: "synthetic", expiry: "2099-01-01" }],
    fetch: async (url) => { assert.ok(String(url).startsWith("https://www.googleapis.com/calendar/")); return { json: async () => ({ items: calendarItems }) }; },
  });
  vm.runInContext(source("../api/lib/google.js"), context);
  const { events } = await context.listUpcomingEvents("u");
  assert.deepEqual(Array.from(events, (event) => event.meetingUrl), calendarItems.map(extractMeetingUrl));
  assert.ok(events.every((event) => event.meetingUrl));
});
test("calendar UI endpoint extracts the same links as auto-join, never a phone entry", async () => {
  const context = vm.createContext({ Date, URLSearchParams, encodeURIComponent, extractMeetingUrl, parseMeetingUrl, enabledPlatforms,
    process: { env: { BOT_ENABLED_PLATFORMS: "google_meet,zoom,teams", BOT_ORCHESTRATOR_URL: "https://orchestrator.example.test" } },
    parseCookies: () => ({ om_session: "synthetic" }),
    sb: async (query) => query.startsWith("sessions?") ? [{ user_id: "u" }]
      : query.startsWith("meetings?") ? [] : query.startsWith("app_users?") ? [{ auto_join: true }]
      : [{ access_token: "synthetic", expiry: "2099-01-01" }],
    fetch: async (url) => { assert.ok(String(url).startsWith("https://www.googleapis.com/calendar/")); return { json: async () => ({ items: calendarItems }) }; },
  });
  vm.runInContext(source("../api/calendar/events.js"), context);
  const res = response(); await context.handler({ headers: {} }, res);
  assert.equal(res.code, 200); assert.deepEqual(Array.from(res.body.events, (event) => event.meetingUrl), calendarItems.map(extractMeetingUrl));
});
test("manual API preserves disabled/dispatch HTTP statuses and rejects malformed links", async () => {
  for (const result of [{ error: "platform_disabled", status: 409 }, { error: "bot_dispatch_failed", status: 400 }, { error: "bot_backend_unavailable", status: 503 }]) {
    const context = vm.createContext({ Date, encodeURIComponent, parseMeetingUrl, parseCookies: () => ({ om_session: "synthetic" }),
      sb: async () => [{ user_id: "u" }], scheduleBot: async (_uid, input) => { assert.equal(input.manualRetry, true); return result; },
    });
    vm.runInContext(source("../api/recall/start-bot.js"), context);
    const res = response(); await context.handler({ method: "POST", headers: {}, body: { meetingUrl: urls.zoom } }, res);
    assert.equal(res.code, result.status); assert.equal(res.body.error, result.error);
    const invalid = response(); await context.handler({ method: "POST", headers: {}, body: { meetingUrl: "not-a-url" } }, invalid);
    assert.equal(invalid.code, 400); assert.equal(invalid.body.error, "invalid_meeting_url");
  }
});

test("authenticated per-event enable explicitly opts into a manual retry", async () => {
  let scheduled;
  const start = new Date(Date.now() - 5 * 60000).toISOString();
  const context = vm.createContext({ Date, URL, encodeURIComponent, parseMeetingUrl, enabledPlatforms,
    process: { env: { BOT_ORCHESTRATOR_URL: "https://orchestrator.example.test" } },
    parseCookies: () => ({ om_session: "synthetic" }),
    listUpcomingEvents: async () => ({ events: [{ id: "event", meetingUrl: urls.google_meet, start }] }),
    sb: async query => query.startsWith("sessions?") ? [{ user_id: "u" }] : query.startsWith("app_users?") ? [{ notetaker_name: "Test bot" }] : [{ id: "old", status: "error", meeting_url: urls.google_meet, start_time: start }],
    scheduleBot: async (_uid, input) => { scheduled = input; return { ok: true }; }, ensureShareToken: async () => "unused", stopOrchestratorJob: async () => {},
  });
  vm.runInContext(source("../api/event-bot.js"), context);
  const res = response(); await context.handler({ method: "POST", url: "/api/event-bot", headers: {}, body: { eventId: "event", enable: true } }, res);
  assert.equal(res.body.ok, true); assert.equal(scheduled.manualRetry, true); assert.equal(scheduled.calendarEventId, "event");
});
test("frontend labels use the canonical parser and error copy never echoes server secrets", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = app.indexOf("function platformFromUrl("); const end = app.indexOf('// "mm:ss"', start);
  assert.ok(start > 0 && end > start);
  for (const CUR_LANG of ["en", "es"]) {
    const context = vm.createContext({ platformLabel, CUR_LANG }); vm.runInContext(app.slice(start, end), context);
    assert.equal(context.platformFromUrl("https://evil.example/?next=https://zoom.us/j/123"), null);
    const copy = context.botStartError({ error: "platform_disabled", detail: "synthetic-code" });
    assert.ok(copy.length > 20); assert.ok(!copy.includes("synthetic-code"));
    assert.ok(!context.botStartError({ error: "private-url?pwd=secret" }).includes("secret"));
  }
});
