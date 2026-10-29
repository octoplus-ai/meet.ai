import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { cameraMetadata, preserveCameraMetadata } from "../api/lib/speaker-media.js";
import { partialCaptureSummary, PARTIAL_CAPTURE_NOTICES, captureWindow } from '../api/lib/capture-integrity.js';
const source = fs.readFileSync(new URL("../api/bot/ingest.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace('export const config', 'const config').replace("export default async function handler", "async function handler");
const payload = { secret: "mock", meetingId: "m", pipUrl: "https://media.example.test/m/pip.mp4", shareIntervals: [[0, 60]], durationMin: 1,
  stage: { presenterMedia: { pipStatus: "partial", pipIntervals: [[10, 30]], pipTimeline: [{ t: 0, state: "camera_off", name: "Test" }] } } };
async function run({ body = payload, status = "processing", failAI = false, prior, meetingFields = {} } = {}) {
  const meeting = { id: "m", user_id: "u", status, stage_info: prior ? { presenterMedia: prior } : {}, ...meetingFields };
  let report = prior ? { coaching: { ...prior, strengths: ["Existing"] } } : null;
  let aiCalls = 0, writes = 0;
  const context = vm.createContext({ Date, encodeURIComponent, console: { error() {}, log() {} },
    process: { env: { BOT_INGEST_SECRET: "mock" } }, cameraMetadata, preserveCameraMetadata, partialCaptureSummary, captureWindow, ANALYSIS_VERSION: 13,
    sanitizeSpeakerMap: () => ({}), notifyParticipants: async () => {},
    analyzeTranscript: async () => { aiCalls++; if (failAI) throw new Error("mock provider failure"); return { summary: "Synthetic summary", scores: {}, coaching: {} }; },
    sb: async (query, options = {}) => {
      if (options.method) writes++;
      if (query.startsWith("meetings?")) { if (options.method === "PATCH") Object.assign(meeting, options.body); return [meeting]; }
      if (query.startsWith("reports?")) {
        if (options.method === "PATCH") report = { ...report, ...options.body };
        if (options.method === "DELETE") report = null;
        return report ? [report] : [];
      }
      if (query === "reports" && options.method === "POST") { report = options.body; return null; }
      throw new Error("Unexpected mocked database route");
    },
  });
  vm.runInContext(source, context);
  const response = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.body = data; } };
  await context.handler({ method: "POST", headers: {}, body }, response);
  return { meeting, report, aiCalls, writes, response };
}
test("silent recording preserves metadata on meeting before skipping analysis", async () => {
  const result = await run();
  assert.equal(result.aiCalls, 0);
  assert.equal(result.meeting.stage_info.presenterMedia.pipStatus, "partial");
  assert.deepEqual(result.meeting.stage_info.presenterMedia.pipIntervals, [[10, 30]]);
});
test("provider failure preserves new camera metadata and existing coaching", async () => {
  const result = await run({ body: { ...payload, turns: [{ t: "00:00", speaker: "Test", text: "Synthetic words" }] }, failAI: true, prior: { pipUrl: "old", shareIntervals: [] } });
  assert.equal(result.response.code, 500);
  assert.equal(result.report.coaching.pipStatus, "partial");
  assert.deepEqual(Array.from(result.report.coaching.strengths), ["Existing"]);
  assert.equal(result.meeting.stage_info.presenterMedia.pipUrl, payload.pipUrl);
});
test("successful report copies the complete validated metadata into coaching", async () => {
  const result = await run({ body: { ...payload, turns: [{ t: "00:00", speaker: "Test", text: "Synthetic words" }] } });
  assert.equal(result.response.code, 200); assert.equal(result.meeting.status, "done");
  assert.equal(result.report.coaching.pipTimeline[0].state, "camera_off");
  assert.deepEqual(result.report.coaching.pipIntervals, [[10, 30]]);
});
test("already-done callback stays idempotent and does not invalidate prior camera evidence", async () => {
  const prior = cameraMetadata(payload);
  const result = await run({ status: "done", prior, body: { secret: "mock", meetingId: "m" } });
  assert.equal(result.writes, 0); assert.equal(result.aiCalls, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.meeting.stage_info.presenterMedia)), prior);
});
test("retry without camera fields preserves existing evidence instead of replacing it with null", async () => {
  const prior = cameraMetadata(payload);
  const result = await run({ prior, body: { secret: "mock", meetingId: "m" } });
  assert.deepEqual(JSON.parse(JSON.stringify(result.meeting.stage_info.presenterMedia)), prior);
});

test('authenticated partial recovery persists language and warning before recap delivery', async () => {
  const result = await run({ body: { ...payload, languageCode: 'es', stage: { captureInterrupted: true, recovery: { fullMeetingRecovered: false } }, turns: [{ t: '00:00', speaker: 'Test', text: 'Synthetic captured words' }] } });
  assert.equal(result.response.code, 200);
  assert.equal(result.meeting.stage_info.languageCode, 'es');
  assert.equal(result.report.summary, PARTIAL_CAPTURE_NOTICES.es + '\n\nSynthetic summary');
});

test('unauthenticated callback cannot forge capture integrity metadata or write a report', async () => {
  const result = await run({ body: { ...payload, secret: 'invalid', languageCode: 'es', stage: { captureInterrupted: true } } });
  assert.equal(result.response.code, 401); assert.equal(result.writes, 0); assert.equal(result.aiCalls, 0);
});

const scheduled = { start_time: '2020-01-02T21:00:00.000Z', end_time: '2020-01-02T21:30:00.000Z' };
const timing = { captureStartedAt: '2020-01-02T21:01:06.571Z', captureEndedAt: '2020-01-02T21:17:30.944Z' };
const spokenPayload = { ...payload, turns: [{ t: '00:00', speaker: 'Test', text: 'Synthetic captured words' }] };

test('delayed ingest uses captured end time and preserves the scheduled start', async () => {
  const result = await run({ meetingFields: scheduled, body: { ...spokenPayload, stage: timing } });
  assert.equal(result.response.code, 200);
  assert.equal(result.meeting.end_time, timing.captureEndedAt);
  assert.equal(result.meeting.start_time, scheduled.start_time);
  assert.equal(result.meeting.stage_info.captureStartedAt, timing.captureStartedAt);
  assert.notEqual(result.meeting.status_synced_at, timing.captureEndedAt);
});

test('missing or invalid capture timing never replaces the existing end with processing time', async () => {
  const future = new Date(Date.now() + 60000).toISOString();
  for (const stage of [ {}, { captureEndedAt: timing.captureEndedAt },
    { ...timing, captureEndedAt: 'invalid' }, { ...timing, captureEndedAt: future },
    { ...timing, captureEndedAt: timing.captureStartedAt },
    { ...timing, captureEndedAt: '2020-01-03T00:01:06.571Z' },
    { captureStartedAt: '2020-02-30T21:01:00Z', captureEndedAt: '2020-03-01T21:17:00Z' },
  ]) {
    const result = await run({ meetingFields: scheduled, body: { ...spokenPayload, stage } });
    assert.equal(result.response.code, 200);
    assert.equal(result.meeting.end_time, scheduled.end_time);
    assert.equal(result.meeting.start_time, scheduled.start_time);
    assert.equal(result.meeting.stage_info.captureStartedAt, undefined);
    assert.equal(result.meeting.stage_info.captureEndedAt, undefined);
  }
  const missingEnd = await run({ body: spokenPayload });
  assert.equal(missingEnd.meeting.end_time, undefined);
});

test('capture timing survives AI failure and retry without timing fields', async () => {
  const failed = await run({ meetingFields: scheduled, failAI: true, body: { ...spokenPayload, stage: timing } });
  assert.equal(failed.response.code, 500);
  assert.equal(failed.meeting.end_time, timing.captureEndedAt);
  const retried = await run({ meetingFields: failed.meeting, body: spokenPayload });
  assert.equal(retried.meeting.end_time, timing.captureEndedAt);
});

test('capture window permits bounded flush tolerance but rejects longer or future windows', () => {
  const start = Date.parse(timing.captureStartedAt);
  const window = minutes => ({ ...timing, captureEndedAt: new Date(start + minutes * 60000).toISOString() });
  assert.ok(captureWindow(window(122), start + 123 * 60000));
  assert.equal(captureWindow(window(122.001), start + 123 * 60000), null);
  assert.equal(captureWindow(window(120), start + 119 * 60000), null);
  assert.deepEqual(captureWindow({ captureStartedAt: '2020-01-02T21:01:06Z', captureEndedAt: '2020-01-02T21:17:30.9Z' }),
    { captureStartedAt: '2020-01-02T21:01:06.000Z', captureEndedAt: '2020-01-02T21:17:30.900Z' });
});
