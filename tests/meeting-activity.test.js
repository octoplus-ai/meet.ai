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

test("access failures retain their distinct reason and next step in both languages", () => {
  const cases = [
    ["AUTH_REQUIRED", /detected a sign-in requirement/, /detectó una solicitud de inicio de sesión/],
    ["POLICY_BLOCKED", /locked, requires registration, or allows browser joining/, /bloqueada, exige registro o permite ingresar desde el navegador/],
    ["MEETING_DENIED", /denied entry or removed/, /rechazó el ingreso.*quitó de la reunión/],
    ["MEETING_ENDED", /ended before OctoMeet could start recording/, /finalizada antes.*comenzar a grabar/],
    ["CAPTCHA_REQUIRED", /access verification.*could not complete automatically/, /verificación de acceso.*no pudo completar automáticamente/],
  ];
  for (const [code, en, es] of cases) {
    assert.match(captureFailureMessage(code), en, code);
    assert.match(captureFailureMessage(code, { lang: "es" }), es, code);
    assert.doesNotMatch(captureFailureMessage(code), /Check guest permissions/);
  }
  for (const lang of ["en", "es"]) {
    assert.equal(new Set(cases.map(([code]) => captureFailureMessage(code, { lang }))).size, cases.length);
    assert.equal(captureFailureMessage("BOUNCED_TO_SIGNIN", { lang }), captureFailureMessage("AUTH_REQUIRED", { lang }));
    for (const code of ["REQUEST_DENIED", "DENIED"]) {
      assert.equal(captureFailureMessage(code, { lang }), captureFailureMessage("MEETING_DENIED", { lang }));
    }
  }
});

test("unconfirmed join requests are not misreported as waiting-room or permission failures", () => {
  assert.match(captureFailureMessage("JOIN_REQUEST_NOT_REGISTERED"), /could not confirm.*request to join was submitted/);
  assert.match(captureFailureMessage("JOIN_REQUEST_NOT_REGISTERED", { lang: "es" }), /no pudo confirmar.*solicitud de ingreso/);
  assert.doesNotMatch(captureFailureMessage("JOIN_REQUEST_NOT_REGISTERED"), /permissions|waiting room|denied/i);
  for (const lang of ["en", "es"]) {
    assert.notEqual(captureFailureMessage("JOIN_REQUEST_NOT_REGISTERED", { lang }), captureFailureMessage("ADMISSION_TIMEOUT", { lang }));
    for (const code of ["NOT_ADMITTED_TIMEOUT", "REQUEST_TIMEOUT"]) {
      assert.equal(captureFailureMessage(code, { lang }), captureFailureMessage("ADMISSION_TIMEOUT", { lang }));
    }
  }
  assert.match(captureFailureMessage("ADMISSION_TIMEOUT"), /timed out.*confirm entry/);
  assert.match(captureFailureMessage("ADMISSION_TIMEOUT"), /if it appears in the waiting room/);
});

test("unconfirmed recording notices do not claim chat was disabled or the bot was denied entry", () => {
  assert.match(captureFailureMessage("ANNOUNCEMENT_UNAVAILABLE"), /could not confirm.*sent to everyone/);
  assert.match(captureFailureMessage("ANNOUNCEMENT_UNAVAILABLE", { lang: "es" }), /no pudo confirmar.*aviso de grabación a todos/);
  assert.doesNotMatch(captureFailureMessage("ANNOUNCEMENT_UNAVAILABLE"), /disabled|denied|permissions|Enable chat/);
});

test("saved media remains accessible even when the report failed", () => {
  assert.match(captureFailureMessage("RECORDING_FAILED", { hasRecording: true }), /recording is saved/);
  assert.doesNotMatch(captureFailureMessage("RECORDING_FAILED", { hasRecording: true }), /no saved recording/);
  assert.equal(savedRecordingUrl("https://media.example.test/meeting.mp4?signature=fixture"), "https://media.example.test/meeting.mp4?signature=fixture");
  assert.equal(savedRecordingUrl("/api/media/access?meetingId=fixture"), "/api/media/access?meetingId=fixture");
  for (const lang of ["en", "es"]) {
    for (const error of ["AUTH_REQUIRED", "POLICY_BLOCKED", "MEETING_DENIED", "MEETING_ENDED", "ANNOUNCEMENT_UNAVAILABLE", "JOIN_REQUEST_NOT_REGISTERED", "ADMISSION_TIMEOUT"]) {
      assert.equal(captureFailureMessage(error, { hasRecording: true, lang }), captureFailureMessage("RECORDING_FAILED", { hasRecording: true, lang }));
    }
  }
});

test("native Zoom failures explain the stage without hiding a saved video or inventing a report", () => {
  const cases = [
    ["RTMS_START_NOT_AUTHORIZED", /No authorized Zoom stream was received during the meeting window/, /No se recibió una transmisión autorizada de Zoom durante el horario de la reunión/],
    ["RTMS_CONNECTION_FAILED", /capture connection/, /conexión de captura/],
    ["RTMS_MEDIA_UNAVAILABLE", /usable audio or video/, /audio o video utilizable/],
    ["RTMS_RECORDING_FAILED", /recording could not be completed/, /completar la grabación/],
    ["RTMS_UPLOAD_FAILED", /could not be uploaded yet/, /Todavía no se pudo subir/],
    ["RTMS_TRANSCRIPTION_FAILED", /transcription could not be completed/, /completar la transcripción/],
    ["RTMS_PROCESSING_FAILED", /report could not be completed/, /completar el informe/],
    ["RTMS_NO_SPEECH", /no report was generated/, /no se generó un informe/],
  ];
  for (const [code, en, es] of cases) {
    assert.match(captureFailureMessage(code), en);
    assert.match(captureFailureMessage(code, { lang: "es" }), es);
    for (const lang of ["en", "es"]) {
      const saved = captureFailureMessage(code, { lang, hasRecording: true });
      assert.match(saved, lang === "es" ? /grabación está guardada.*ver el video/ : /recording is saved.*watch the video/);
      if (["RTMS_TRANSCRIPTION_FAILED", "RTMS_PROCESSING_FAILED", "RTMS_NO_SPEECH"].includes(code)) assert.match(saved, lang === "es" ? es : en);
      if (code === "RTMS_UPLOAD_FAILED") assert.doesNotMatch(saved, /could not be uploaded|no se pudo subir/);
      if (code === "RTMS_START_NOT_AUTHORIZED") assert.doesNotMatch(captureFailureMessage(code, { lang }), /host denied|anfitrión rechazó|waiting room|sala de espera/i);
      assert.doesNotMatch(saved, /no saved recording|no hay una grabación guardada/);
      assert.equal(captureFailureMessage(`${code}: token=secret`, { lang }), captureFailureMessage("unknown", { lang }));
    }
  }
});

test("unknown provider diagnostics never leak through the UI", () => {
  for (const lang of ["en", "es"]) {
    for (const code of ["AUTH_REQUIRED", "POLICY_BLOCKED", "MEETING_DENIED", "MEETING_ENDED", "ANNOUNCEMENT_UNAVAILABLE", "JOIN_REQUEST_NOT_REGISTERED", "ADMISSION_TIMEOUT"]) {
      const message = captureFailureMessage(`${code}: https://zoom.us/j/123?pwd=private-fixture`, { lang });
      assert.equal(message, captureFailureMessage("unknown", { lang }));
      assert.doesNotMatch(message, /private-fixture|zoom\.us|AUTH_REQUIRED|JOIN_REQUEST/);
    }
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
