import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { cameraMetadata, preserveCameraMetadata } from "../api/lib/speaker-media.js";
const source = fs.readFileSync(new URL("../api/bot/ingest.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default async function handler", "async function handler");
const payload = { secret: "mock", meetingId: "m", pipUrl: "https://media.example.test/m/pip.mp4", shareIntervals: [[0, 60]], durationMin: 1,
  stage: { presenterMedia: { pipStatus: "partial", pipIntervals: [[10, 30]], pipTimeline: [{ t: 0, state: "camera_off", name: "Test" }] } } };
async function run({ body = payload, status = "processing", failAI = false, prior } = {}) {
  const meeting = { id: "m", user_id: "u", status, stage_info: prior ? { presenterMedia: prior } : {} };
  let report = prior ? { coaching: { ...prior, strengths: ["Existing"] } } : null;
  let aiCalls = 0, writes = 0;
  const context = vm.createContext({ Date, encodeURIComponent, console: { error() {}, log() {} },
    process: { env: { BOT_INGEST_SECRET: "mock" } }, cameraMetadata, preserveCameraMetadata, ANALYSIS_VERSION: 13,
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
