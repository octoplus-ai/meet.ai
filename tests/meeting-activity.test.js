import test from "node:test";
import assert from "node:assert/strict";
import { captureFailureMessage, delayedProcessingCount, failedCaptures, savedRecordingUrl } from "../src/media/meeting-activity.js";

test("failed real meetings remain discoverable without mixing completed reports or skipped events", () => {
  const rows = [
    { id: "failed", real: true, status: "error" },
    { id: "done", real: true, status: "done" },
    { id: "processing", real: true, status: "processing" },
    { id: "disabled", real: true, status: "skipped" },
    { id: "demo", real: false, status: "error" },
  ];
  assert.deepEqual(failedCaptures(rows).map(row => row.id), ["failed"]);
});

test("an admission failure says recording did not start, in both supported message languages", () => {
  assert.match(captureFailureMessage("JOIN_REQUEST_NOT_REGISTERED"), /did not start recording/);
  assert.match(captureFailureMessage("ADMISSION_TIMEOUT", { lang: "es" }), /no comenzó a grabar/);
});

test("saved media remains accessible even when the report failed", () => {
  assert.match(captureFailureMessage("RECORDING_FAILED", { hasRecording: true }), /recording is saved/);
  assert.doesNotMatch(captureFailureMessage("RECORDING_FAILED", { hasRecording: true }), /no saved recording/);
  assert.equal(savedRecordingUrl("https://media.example.test/meeting.mp4?signature=fixture"), "https://media.example.test/meeting.mp4?signature=fixture");
  assert.equal(savedRecordingUrl("/api/media/access?meetingId=fixture"), "/api/media/access?meetingId=fixture");
});

test("unknown provider diagnostics never leak through the UI", () => {
  const error = "JOIN_REQUEST_NOT_REGISTERED: https://zoom.us/j/123?pwd=private-fixture";
  for (const lang of ["en", "es"]) {
    const message = captureFailureMessage(error, { lang });
    assert.doesNotMatch(message, /private-fixture|zoom\.us|JOIN_REQUEST/);
  }
});

test("recording links reject executable schemes, protocol-relative URLs and embedded credentials", () => {
  for (const value of [undefined, "", "javascript:alert(1)", "data:text/html,fixture", "//media.example.test/a.mp4", "https://user:secret@example.test/a.mp4"]) {
    assert.equal(savedRecordingUrl(value), null);
  }
});

test("old processing is labeled delayed without turning it into a failed or completed report", () => {
  const now = Date.now();
  const rows = [
    { real: true, status: "processing", syncedAt: now - 31 * 60000 },
    { real: true, status: "processing", syncedAt: now - 5 * 60000 },
    { real: true, status: "done", syncedAt: now - 60 * 60000 },
    { real: true, status: "error", syncedAt: now - 60 * 60000 },
  ];
  assert.equal(delayedProcessingCount(rows, now), 1);
  assert.equal(rows[0].status, "processing");
});
