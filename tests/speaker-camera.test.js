import test from "node:test";
import assert from "node:assert/strict";
import { cameraMetadata, normalizeCameraIntervals, preserveCameraMetadata } from "../api/lib/speaker-media.js";

const delivered = {
  durationMin: 2, pipUrl: "https://media.example.test/m/pip.mp4", shareIntervals: [[10, 80]],
  stage: { presenterMedia: { version: 1, pipStatus: "partial", pipIntervals: [[20, 40]],
    pipTimeline: [{ t: 10, state: "camera_off", name: "Test" }, { t: 20, state: "camera", name: "Test" }] } },
};
test("nested worker metadata preserves the existing flat URL/share transport", () => {
  const media = cameraMetadata(delivered);
  assert.equal(media.pipUrl, delivered.pipUrl);
  assert.deepEqual(media.shareIntervals, [[10, 80]]);
  assert.deepEqual(media.pipIntervals, [[20, 40]]);
  assert.equal(media.pipStatus, "partial");
  assert.equal(media.pipTimeline[0].state, "camera_off");
});
test("zero is valid; null/string/nonfinite/reversed intervals cannot fabricate coverage", () => {
  assert.deepEqual(normalizeCameraIntervals([[0, 2], [1, 4], [4, 9], [8, 7], [null, 20], ["0", 1]], 5), [[0, 5]]);
});
test("empty coverage and empty screen shares stay empty, never all-meeting fallbacks", () => {
  const noCamera = cameraMetadata({ ...delivered, stage: { presenterMedia: { pipStatus: "available", pipIntervals: [] } } });
  assert.equal(noCamera.pipStatus, "unavailable"); assert.equal(noCamera.pipUrl, null);
  assert.deepEqual(noCamera.pipIntervals, []);
  const noShares = cameraMetadata({ ...delivered, shareIntervals: [] });
  assert.deepEqual(noShares.shareIntervals, []); assert.deepEqual(noShares.pipIntervals, []);
});
test("coverage is bounded by both actual shares and recording duration", () => {
  const media = cameraMetadata({ ...delivered, shareIntervals: [[10, 1000]], stage: { videoSec: 120, presenterMedia: { pipStatus: "available", pipIntervals: [[0, 1000]] } } });
  assert.deepEqual(media.shareIntervals, [[10, 120]]);
  assert.deepEqual(media.pipIntervals, [[10, 120]]);
});
test("rounded display minutes never cut the final valid camera seconds", () => {
  const body = { ...delivered, durationMin: 2, shareIntervals: [[120, 149]], stage: { presenterMedia: { pipStatus: "available", pipIntervals: [[120, 149]] } } };
  assert.deepEqual(cameraMetadata(body).pipIntervals, [[120, 149]]);
  assert.deepEqual(cameraMetadata({ ...body, stage: { ...body.stage, videoSec: 148.5 } }).pipIntervals, [[120, 148.5]]);
  assert.deepEqual(cameraMetadata({ ...body, stage: { presenterMedia: { ...body.stage.presenterMedia, durationSec: 148 } } }).pipIntervals, [[120, 148]]);
});
test("legacy metadata remains unverified rather than being upgraded to camera coverage", () => {
  const old = cameraMetadata({ pipUrl: delivered.pipUrl, shareIntervals: [[0, 120]] });
  assert.equal(Object.hasOwn(old, "pipIntervals"), false);
  assert.equal(Object.hasOwn(old, "pipStatus"), false);
});
test("disabled/error metadata never publishes a usable camera URL", () => {
  for (const pipStatus of ["disabled", "failed", "unavailable"]) {
    const media = cameraMetadata({ ...delivered, stage: { presenterMedia: { pipStatus, pipIntervals: [[20, 40]] } } });
    assert.equal(media.pipUrl, null);
  }
});
test("reanalysis preservation includes the entire camera evidence contract", () => {
  const media = cameraMetadata(delivered);
  assert.deepEqual(preserveCameraMetadata({ ...media, strengths: ["Not a camera field"] }), media);
  assert.deepEqual(preserveCameraMetadata(null), {});
});
