import test from "node:test";
import assert from "node:assert/strict";
import { ZOOM_CONNECT_URL, disconnectZoom, loadZoomStatus, normalizeZoomStatus, zoomConnectionState, zoomErrorMessage, zoomReturn } from "../src/integrations/zoom-connection.js";

const fixture = (extra = {}) => ({ configured: true, connected: true, rtmsConfigured: true, captureMode: "native_rtms", capabilities: { audio: true, video: true, screenshare: true, transcript: false }, email: "member@example.test", ...extra });
const response = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });

test("OAuth callbacks route to integrations without treating success as connection evidence", () => {
  assert.equal(ZOOM_CONNECT_URL, "/api/auth/zoom/start");
  assert.deepEqual(zoomReturn("?zoom=connected&share=keep"), { connected: true });
  assert.equal(zoomReturn("?zoom=anything"), null);
  assert.deepEqual(zoomReturn("?zoom_error=zoom_reconnect_required"), { error: "zoom_reconnect_required" });
  assert.deepEqual(zoomReturn("?zoom_error=private-token-https://provider.test"), { error: "zoom_status_failed" });
  assert.equal(zoomConnectionState(null), "unknown");
});

test("account, media grant, service configuration and meeting access remain distinct", () => {
  const cases = [
    [fixture({ configured: false, connected: false, rtmsConfigured: false }), "configuration_pending"],
    [fixture({ connected: false }), "disconnected"],
    [fixture({ capabilities: { audio: false, video: true } }), "permissions_missing"],
    [fixture({ rtmsConfigured: false }), "rtms_pending"],
    [fixture(), "connected"],
  ];
  for (const [raw, expected] of cases) {
    const data = normalizeZoomStatus(raw);
    assert.equal(zoomConnectionState(data), expected);
    assert.equal(data.meetingAccess, "requires_zoom_permission");
    assert.equal(Object.hasOwn(data, "recording"), false);
  }
});

test("missing or malformed responses cannot show a connected state", () => {
  for (const raw of [null, {}, { connected: true }, fixture({ configured: "true" }), fixture({ captureMode: "browser" })]) {
    assert.throws(() => normalizeZoomStatus(raw), /zoom_status_failed/);
  }
  const data = normalizeZoomStatus(fixture({ connected: false, account: { email: "old@example.test" } }));
  assert.equal(data.email, null);
  assert.deepEqual(data.capabilities, { audio: false, video: false, screenshare: false, transcript: false });
});

test("camera access never substitutes for the separate screen-sharing grant", () => {
  for (const screenshare of [undefined, false, "true"]) {
    const data = normalizeZoomStatus(fixture({ capabilities: { audio: true, video: true, transcript: true, screenshare } }));
    assert.equal(data.capabilities.video, true);
    assert.equal(data.capabilities.screenshare, false);
    assert.equal(zoomConnectionState(data), "permissions_missing");
  }
  assert.equal(zoomConnectionState(normalizeZoomStatus(fixture())), "connected");
  assert.equal(normalizeZoomStatus(fixture()).capabilities.transcript, false, "Zoom transcript permission is not required for OctoMeet audio transcription");
});

test("status request uses session credentials and no cache, and strips non-UI fields", async () => {
  const controller = new AbortController();
  const data = await loadZoomStatus(async (url, options) => {
    assert.equal(url, "/api/zoom/status");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal, controller.signal);
    return response(fixture({ access_token: "must-not-reach-view", scopes: ["private-debug"], meetingAccess: "all" }));
  }, controller.signal);
  assert.equal(data.meetingAccess, "requires_zoom_permission");
  assert.equal(Object.hasOwn(data, "access_token"), false);
  assert.equal(Object.hasOwn(data, "scopes"), false);
});

test("disconnect requires a confirmed server response and sends the JSON contract", async () => {
  await disconnectZoom(async (url, options) => {
    assert.equal(url, "/api/zoom/disconnect");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), {});
    return response({ ok: true, connected: false });
  });
  for (const body of [{ ok: true }, { connected: false }, { ok: true, connected: true }, { error: "secret" }]) {
    await assert.rejects(disconnectZoom(async () => response(body)), /zoom_disconnect_failed/);
  }
});

test("failed requests preserve safe actionable error codes without provider details", async () => {
  await assert.rejects(loadZoomStatus(async () => response({ error: "private-token" }, 500)), /^Error: zoom_status_failed$/);
  await assert.rejects(disconnectZoom(async () => response({ error: "private-token" }, 500)), /^Error: zoom_disconnect_failed$/);
  await assert.rejects(loadZoomStatus(async () => response({}, 401)), /^Error: not_authenticated$/);
  await assert.rejects(loadZoomStatus(async () => response({ error: "zoom_reconnect_required" }, 409)), /^Error: zoom_reconnect_required$/);
  for (const lang of ["en", "es"]) {
    assert.doesNotMatch(zoomErrorMessage("secret https://zoom.test/?token=private", lang), /secret|token|zoom\.test/);
    assert.notEqual(zoomErrorMessage("zoom_disconnect_failed", lang), zoomErrorMessage("zoom_status_failed", lang));
  }
});
