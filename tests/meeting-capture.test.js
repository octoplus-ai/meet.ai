import test from "node:test";
import assert from "node:assert/strict";
import { captureDisplayStatus, captureDispatchMessage, dispatchAccepted, meetingCaptureMode, recordingPlaybackUrl, zoomAuthorizationSummary, zoomCaptureErrorMessage } from "../src/media/meeting-capture.js";

test("completed Zoom RTMS recordings play directly without a Recall bot id", () => {
  const row = { status: "done", capture_mode: "zoom_rtms", source: "Zoom", bot_id: null, recording_url: "https://media.example.test/zoom.mp4" };
  assert.equal(recordingPlaybackUrl(row), row.recording_url);
  for (const status of ["scheduled", "joining", "recording", "processing", "error"]) {
    assert.equal(recordingPlaybackUrl({ ...row, status }), null, status);
  }
  for (const recording_url of [undefined, "", "javascript:alert(1)", "//media.example.test/a", "https://u:secret@media.example.test/a"]) {
    assert.equal(recordingPlaybackUrl({ ...row, source: "Recall", bot_id: "old-recall-id", recording_url }), null);
  }
});

test("Meet, Teams and legacy Recall playback remain supported", () => {
  const row = { status: "done", recording_url: "/api/media/access?meetingId=fixture", capture_mode: "inhouse_bot" };
  assert.equal(recordingPlaybackUrl(row), row.recording_url);
  assert.equal(recordingPlaybackUrl({ status: "done", source: "Recall", bot_id: "fixture/id" }), "/api/recall/media?botId=fixture%2Fid");
  assert.equal(recordingPlaybackUrl({ status: "done", source: "Recall", bot_id: null }), null);
});

test("RTMS pending states never imply joining or recording until the media state says recording", () => {
  assert.equal(meetingCaptureMode(null), null, "A closed event popover has no selected meeting");
  for (const status of ["scheduled", "joining", "in_call"]) {
    assert.equal(captureDisplayStatus(status, "zoom_rtms"), "awaiting_authorization");
    assert.equal(captureDisplayStatus(status, "inhouse_bot"), status);
  }
  for (const status of ["recording", "processing", "done", "error", "skipped"]) {
    assert.equal(captureDisplayStatus(status, "zoom_rtms"), status);
  }
  assert.match(zoomAuthorizationSummary(), /Join with your connected Zoom account/);
  assert.match(zoomAuthorizationSummary("es"), /Zoom permite compartir el contenido/);
});

test("manual requests require a positive acknowledgement and an RTMS request still awaits authorization", () => {
  for (const result of [{}, { ok: false }, { ok: true, error: "zoom_api_failed" }]) assert.equal(dispatchAccepted({ ok: true }, result), false);
  assert.equal(dispatchAccepted({ ok: false }, { ok: true }), false);
  assert.equal(dispatchAccepted({ ok: true }, { already: true }), true);
  for (const extra of [{}, { already: true }, { ok: true, requested: "start", awaitingZoomPermission: true }]) {
    const message = captureDispatchMessage({ mode: "zoom_rtms", ...extra });
    assert.match(message, /awaiting Zoom authorization/);
    assert.doesNotMatch(message, /is joining|is recording|will join automatically/);
  }
  assert.match(captureDispatchMessage({ mode: "inhouse" }, { future: true }), /will join automatically/);
});

test("Zoom connection failures have actionable messages without exposing provider diagnostics", () => {
  assert.match(zoomCaptureErrorMessage("zoom_not_connected"), /Connect Zoom in Integrations/);
  assert.match(zoomCaptureErrorMessage("zoom_reconnect_required", "es"), /Reconectá Zoom/);
  assert.match(zoomCaptureErrorMessage("zoom_existing_capture"), /already has a capture/);
  assert.equal(zoomCaptureErrorMessage("zoom_api_failed: secret-token"), null);
  assert.equal(zoomCaptureErrorMessage("AUTH_REQUIRED https://zoom.us/?pwd=private"), null);
});
