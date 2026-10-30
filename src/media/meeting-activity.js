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
  const rtmsMessages = {
    RTMS_START_NOT_AUTHORIZED: ["No authorized Zoom stream was received during the meeting window. Check your Zoom connection, auto-start settings and meeting content access before the next meeting.", "No se recibió una transmisión autorizada de Zoom durante el horario de la reunión. Revisá la conexión de Zoom, el inicio automático y el acceso al contenido antes de la próxima reunión."],
    RTMS_CONNECTION_FAILED: ["OctoMeet could not complete the Zoom capture connection. Check your Zoom connection in Integrations and the meeting's content permissions.", "OctoMeet no pudo completar la conexión de captura con Zoom. Revisá la conexión de Zoom en Integraciones y los permisos de contenido de la reunión."],
    RTMS_MEDIA_UNAVAILABLE: ["OctoMeet could not obtain usable audio or video from Zoom for this capture. Check the meeting's content permissions.", "OctoMeet no pudo obtener audio o video utilizable de Zoom para esta captura. Revisá los permisos de contenido de la reunión."],
    RTMS_RECORDING_FAILED: ["The Zoom recording could not be completed. Check the meeting status before trying again.", "No se pudo completar la grabación de Zoom. Revisá el estado de la reunión antes de reintentar."],
    RTMS_UPLOAD_FAILED: ["The Zoom recording could not be uploaded yet. Check the meeting status before trying again.", "Todavía no se pudo subir la grabación de Zoom. Revisá el estado de la reunión antes de reintentar."],
    RTMS_TRANSCRIPTION_FAILED: ["The Zoom transcription could not be completed, so the report is not available.", "No se pudo completar la transcripción de Zoom, por lo que el informe no está disponible."],
    RTMS_PROCESSING_FAILED: ["The Zoom report could not be completed. Check the meeting status before trying again.", "No se pudo completar el informe de Zoom. Revisá el estado de la reunión antes de reintentar."],
    RTMS_NO_SPEECH: ["No speech transcript was obtained from this Zoom capture, so no report was generated.", "No se obtuvo una transcripción de voz de esta captura de Zoom, por lo que no se generó un informe."],
  };
  const rtmsMessage = rtmsMessages[message]?.[es ? 1 : 0];
  if (rtmsMessage && (!hasRecording || ["RTMS_TRANSCRIPTION_FAILED", "RTMS_PROCESSING_FAILED", "RTMS_NO_SPEECH"].includes(message))) {
    return (hasRecording ? (es ? "La grabación está guardada y podés ver el video. " : "The recording is saved and you can watch the video. ") : "") + rtmsMessage;
  }
  if (hasRecording) return es
    ? "La grabación está guardada, pero el informe no se completó. Podés ver el video."
    : "The recording is saved, but the report did not complete. You can watch the video.";
  if (message === "PROCESSING_STALLED") return es
    ? "El informe no terminó de procesarse y necesita revisión. No hay una grabación disponible en OctoMeet en este momento."
    : "The report did not finish processing and needs review. No recording is currently available in OctoMeet.";
  if (message === "JOIN_REQUEST_NOT_REGISTERED") return es
    ? "OctoMeet no pudo confirmar que la solicitud de ingreso se hubiera enviado y no comenzó a grabar. Revisá el enlace de la invitación antes de volver a intentarlo."
    : "OctoMeet could not confirm that its request to join was submitted and did not start recording. Check the invitation link before trying again.";
  if (/^(NOT_ADMITTED_TIMEOUT|ADMISSION_TIMEOUT|REQUEST_TIMEOUT)$/.test(message)) return es
    ? "Se agotó el tiempo para confirmar el ingreso de OctoMeet y no comenzó a grabar. Comprobá que la reunión esté abierta y admití al bot si aparece en la sala de espera."
    : "OctoMeet timed out before it could confirm entry and did not start recording. Check that the meeting is open and admit the bot if it appears in the waiting room.";
  if (message === "ANNOUNCEMENT_UNAVAILABLE") return es
    ? "OctoMeet no pudo confirmar el envío del aviso de grabación a todos y no comenzó a grabar. Comprobá que el bot pueda usar el chat y enviar mensajes a todos antes de volver a intentarlo."
    : "OctoMeet could not confirm that the recording notice was sent to everyone and did not start recording. Check that the bot can use chat and send messages to everyone before trying again.";
  if (/^(AUTH_REQUIRED|BOUNCED_TO_SIGNIN)$/.test(message)) return es
    ? "OctoMeet detectó una solicitud de inicio de sesión y no pudo completar el ingreso. Revisá la identidad con la que ingresa el bot y los requisitos de acceso a la reunión."
    : "OctoMeet detected a sign-in requirement and could not complete entry. Check the bot's sign-in identity and the meeting's access requirements.";
  if (message === "POLICY_BLOCKED") return es
    ? "Una regla de acceso de la reunión bloqueó a OctoMeet. Pedile al organizador que revise si la reunión está bloqueada, exige registro o permite ingresar desde el navegador."
    : "A meeting access rule blocked OctoMeet. Ask the organizer to check whether the meeting is locked, requires registration, or allows browser joining.";
  if (/^(MEETING_DENIED|REQUEST_DENIED|DENIED)$/.test(message)) return es
    ? "Se rechazó el ingreso de OctoMeet o se lo quitó de la reunión. Confirmá con el organizador que el bot pueda participar antes de volver a intentarlo."
    : "OctoMeet was denied entry or removed from the meeting. Confirm with the organizer that the bot can participate before trying again.";
  if (message === "MEETING_ENDED") return es
    ? "La reunión figuraba como finalizada antes de que OctoMeet pudiera comenzar a grabar. Revisá el horario y usá el enlace de una reunión activa."
    : "The meeting was shown as ended before OctoMeet could start recording. Check the scheduled time and use an active meeting link.";
  if (message === "CAPTCHA_REQUIRED") return es
    ? "La reunión pidió una verificación de acceso que OctoMeet no pudo completar automáticamente. Contactá a soporte antes de volver a intentarlo."
    : "The meeting requested an access verification that OctoMeet could not complete automatically. Contact support before trying again.";
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
