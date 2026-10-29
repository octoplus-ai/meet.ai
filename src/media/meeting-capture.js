import { savedRecordingUrl } from "./meeting-activity.js";

export function meetingCaptureMode(meeting = {}) {
  return meeting?.captureMode || meeting?.capture_mode || meeting?.mode || null;
}

// Preparing or requesting a Zoom stream does not prove that media is being received.
export function captureDisplayStatus(status, captureMode) {
  return captureMode === "zoom_rtms" && ["scheduled", "joining", "in_call"].includes(status)
    ? "awaiting_authorization" : status;
}

export function zoomAuthorizationLabel(lang = "en") {
  return lang === "es" ? "Esperando autorización de Zoom" : "Awaiting Zoom authorization";
}

export function zoomAuthorizationSummary(lang = "en") {
  return lang === "es"
    ? "OctoMeet está preparado para esta reunión. Ingresá con tu cuenta de Zoom conectada y autorizá el acceso cuando Zoom lo solicite. La grabación comienza cuando Zoom permite compartir el contenido y OctoMeet recibe los medios."
    : "OctoMeet is prepared for this meeting. Join with your connected Zoom account and authorize access when Zoom asks. Recording starts when Zoom allows content sharing and OctoMeet receives the media.";
}

export function recordingPlaybackUrl(meeting = {}) {
  if (meeting.status !== "done") return null;
  const mode = meetingCaptureMode(meeting);
  // Native captures never fall through to Recall, including rows without a bot id.
  if (mode === "inhouse_bot" || mode === "zoom_rtms") return savedRecordingUrl(meeting.recording_url);
  return meeting.source === "Recall" && typeof meeting.bot_id === "string" && meeting.bot_id.trim()
    ? `/api/recall/media?botId=${encodeURIComponent(meeting.bot_id)}` : null;
}

export function dispatchAccepted(response, result = {}) {
  return response?.ok === true && !result.error && (result.ok === true || result.already === true);
}

export function captureDispatchMessage(result = {}, { future = false, lang = "en" } = {}) {
  const es = lang === "es";
  if (meetingCaptureMode(result) === "zoom_rtms") {
    // Even an acknowledged start request still needs Zoom's per-meeting authorization.
    return es
      ? "Solicitud preparada. Ingresá con tu cuenta de Zoom conectada; esperamos la autorización de Zoom para grabar."
      : "Request prepared. Join with your connected Zoom account; we are awaiting Zoom authorization to record.";
  }
  if (result.already) return es ? "OctoMeet ya está preparado para esta reunión ✓" : "OctoMeet is already set for this meeting ✓";
  if (future) return es ? "OctoMeet se unirá automáticamente a la hora de inicio 🗓️" : "OctoMeet will join automatically at the start time 🗓️";
  return es ? "OctoMeet se está uniendo a la reunión 🎥" : "OctoMeet is joining the meeting 🎥";
}

export function zoomCaptureErrorMessage(reason, lang = "en") {
  const messages = {
    zoom_not_connected: ["Connect Zoom in Integrations to prepare this meeting.", "Conectá Zoom en Integraciones para preparar esta reunión."],
    zoom_reconnect_required: ["Reconnect Zoom in Integrations to renew access.", "Reconectá Zoom en Integraciones para renovar el acceso."],
    zoom_rtms_not_ready: ["Zoom capture is not ready. Check the connection in Integrations.", "La captura de Zoom no está lista. Revisá la conexión en Integraciones."],
    zoom_configuration_unavailable: ["Could not confirm the Zoom configuration. Try again later.", "No se pudo confirmar la configuración de Zoom. Reintentá más tarde."],
    zoom_existing_capture: ["This meeting already has a capture in progress or scheduled. Check its status before retrying.", "Esta reunión ya tiene una captura en curso o programada. Revisá su estado antes de reintentar."],
    zoom_meeting_id_required: ["Use a Zoom invitation link that includes the meeting ID.", "Usá un enlace de invitación de Zoom que incluya el ID de la reunión."],
    zoom_api_failed: ["Could not confirm Zoom's response. Check the meeting status before retrying.", "No se pudo confirmar la respuesta de Zoom. Revisá el estado de la reunión antes de reintentar."],
  };
  return messages[reason]?.[lang === "es" ? 1 : 0] || null;
}
