import test from "node:test";
import assert from "node:assert/strict";
import { bindSpeakerVideo, inIntervals, speakerAvailability } from "../src/media/speaker-sync.js";
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
  assert.equal(inIntervals(0, [[0, 1]]), true);
  assert.equal(inIntervals(1, [[0, 1]]), false);
  assert.equal(inIntervals(0, [[null, 1]]), false);
  assert.equal(inIntervals(0, [["0", 1]]), false);
  assert.equal(inIntervals(0, [[0, Infinity]]), false);
  assert.deepEqual(normalizeCameraIntervals([[0, 2], [1, 4], [4, 9], [8, 7], [null, 20], ["0", 1]], 5), [[0, 5]]);
});
test("empty coverage and empty screen shares stay empty, never all-meeting fallbacks", () => {
  const noCamera = cameraMetadata({ ...delivered, stage: { presenterMedia: { pipStatus: "available", pipIntervals: [] } } });
  assert.equal(noCamera.pipStatus, "unavailable"); assert.equal(noCamera.pipUrl, null);
  assert.deepEqual(noCamera.pipIntervals, []);
  const noShares = cameraMetadata({ ...delivered, shareIntervals: [] });
  assert.deepEqual(noShares.shareIntervals, []); assert.deepEqual(noShares.pipIntervals, []);
  assert.equal(speakerAvailability(noShares, 0).reason, "noShares");
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
  assert.equal(speakerAvailability(old, 30).reason, "legacy");
  assert.equal(speakerAvailability(old, 30).verified, false);
});
test("UI distinguishes outside share, camera off, valid camera and missing camera", () => {
  const media = cameraMetadata(delivered);
  assert.equal(speakerAvailability(media, 0).reason, "waiting");
  assert.equal(speakerAvailability(media, 15).reason, "cameraOff");
  assert.equal(speakerAvailability(media, 30).visible, true);
  assert.equal(speakerAvailability(media, 50).visible, false);
  assert.equal(speakerAvailability(media, 50).reason, "noCamera");
  assert.equal(speakerAvailability({ ...media, pipIntervals: [], pipUrl: null }, 15).reason, "cameraOff");
});
test("disabled/error status never renders a camera even with a supplied URL", () => {
  for (const pipStatus of ["disabled", "failed", "unavailable"]) {
    const media = cameraMetadata({ ...delivered, stage: { presenterMedia: { pipStatus, pipIntervals: [[20, 40]] } } });
    assert.equal(media.pipUrl, null);
    assert.equal(speakerAvailability(media, 30).visible, false);
  }
});
test("reanalysis preservation includes the entire camera evidence contract", () => {
  const media = cameraMetadata(delivered);
  assert.deepEqual(preserveCameraMetadata({ ...media, strengths: ["Not a camera field"] }), media);
  assert.deepEqual(preserveCameraMetadata(null), {});
});
class Video extends EventTarget {
  readyState = 2; currentTime = 0; duration = 120; playbackRate = 1; paused = true; ended = false;
  pause() { this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
}
function scheduler() {
  const callbacks = new Set();
  return { callbacks, setInterval(fn) { callbacks.add(fn); return fn; }, clearInterval(fn) { callbacks.delete(fn); }, tick() { callbacks.forEach((fn) => fn()); } };
}
test("metadata-only readiness can seek to the paused main timestamp", () => {
  const main = new Video(), camera = new Video(), clock = scheduler();
  main.currentTime = 60; camera.readyState = 1;
  const stop = bindSpeakerVideo(main, camera, { clock });
  assert.equal(camera.currentTime, 60); assert.equal(camera.paused, true);
  stop(); assert.equal(clock.callbacks.size, 0);
});
test("collapse/remount binds the actual new camera element, pause and rate remain synchronized", () => {
  const main = new Video(), old = new Video(), fresh = new Video(), clock = scheduler();
  main.currentTime = 30; main.paused = false;
  const stopOld = bindSpeakerVideo(main, old, { clock }); stopOld();
  main.currentTime = 70;
  const stop = bindSpeakerVideo(main, fresh, { clock }); clock.tick();
  assert.equal(fresh.currentTime, 70); assert.equal(old.currentTime, 30); assert.equal(old.paused, true);
  main.paused = true; main.dispatchEvent(new Event("pause")); assert.equal(fresh.paused, true);
  main.playbackRate = 2; main.dispatchEvent(new Event("ratechange")); assert.equal(fresh.playbackRate, 2);
  stop(); assert.equal(clock.callbacks.size, 0);
});
test("truncated camera reports failure instead of displaying its last frame forever", () => {
  const main = new Video(), camera = new Video(), clock = scheduler(); let errors = 0;
  main.currentTime = 80; camera.duration = 60;
  const stop = bindSpeakerVideo(main, camera, { clock, onError: () => errors++ });
  assert.equal(errors, 1); assert.equal(camera.paused, true); stop();
});
