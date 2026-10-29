// Keep incomplete captures visible without presenting them as completed reports.
// Error strings can contain provider diagnostics; only show allowlisted messages.
export function savedRecordingUrl(value) {
  if (typeof value !== "string") return null;
  if (/^\/api\/[A-Za-z0-9/_?=&%.-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function captureFailureMessage(error, { hasRecording = false, lang = "en" } = {}) {
  const es = lang === "es";
  const message = String(error || "");
  if (hasRecording) return es
    ? "La grabación está guardada, pero el informe no se completó. Podés ver el video."
    : "The recording is saved, but the report did not complete. You can watch the video.";
  if (/^(JOIN_REQUEST_NOT_REGISTERED|NOT_ADMITTED_TIMEOUT|ADMISSION_TIMEOUT|REQUEST_TIMEOUT)$/.test(message)) return es
    ? "OctoMeet no pudo confirmar el ingreso a la reunión y no comenzó a grabar. En la próxima reunión, revisá la sala de espera y admití al bot si aparece allí."
    : "OctoMeet could not confirm entry to the meeting and did not start recording. In the next meeting, check the waiting room and admit the bot if it appears there.";
  if (message === "ANNOUNCEMENT_UNAVAILABLE") return es
    ? "OctoMeet no pudo publicar el aviso de grabación en el chat y no comenzó a grabar. Habilitá el chat para el bot antes de volver a probar."
    : "OctoMeet could not post the recording notice in chat and did not start recording. Enable chat for the bot before trying again.";
  if (/^(MEETING_DENIED|REQUEST_DENIED|POLICY_BLOCKED|AUTH_REQUIRED|BOUNCED_TO_SIGNIN|CAPTCHA_REQUIRED)$/.test(message)) return es
    ? "La configuración de acceso impidió que OctoMeet completara el ingreso. Revisá los permisos de invitados antes de volver a probar."
    : "Meeting access settings prevented OctoMeet from completing entry. Check guest permissions before trying again.";
  if (/^(PASSCODE_REQUIRED|PASSCODE_INVALID|invalid_meeting_url|unsupported_platform)$/.test(message)) return es
    ? "OctoMeet no pudo usar el enlace o código de acceso. Revisá la invitación del calendario antes de volver a probar."
    : "OctoMeet could not use the meeting link or passcode. Check the calendar invitation before trying again.";
  if (/^No speech was captured in this meeting\.?$/.test(message)) return es
    ? "No se obtuvo una transcripción ni hay una grabación guardada disponible. Revisá el audio antes de la próxima reunión."
    : "No transcript or saved recording is available. Check the audio before the next meeting.";
  return es
    ? "La reunión no se completó y no hay una grabación guardada disponible. Volvé a probar en una reunión nueva."
    : "The meeting did not complete and no saved recording is available. Try again in a new meeting.";
}

export function failedCaptures(meetings) {
  return meetings.filter(meeting => meeting.real && meeting.status === "error");
}

export function delayedProcessingCount(meetings, now = Date.now()) {
  return meetings.filter(meeting => meeting.real && meeting.status === "processing"
    && Number.isFinite(meeting.syncedAt) && now - meeting.syncedAt > 30 * 60000).length;
}
