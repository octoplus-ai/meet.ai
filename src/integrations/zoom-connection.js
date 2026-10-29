// A Zoom OAuth grant is separate from RTMS configuration and per-meeting consent.
export const ZOOM_CONNECT_URL = "/api/auth/zoom/start";
export const ZOOM_SETTINGS_URL = "https://zoom.us/profile/setting?tab=zoomapps";

const SAFE_ERRORS = new Set([
  "zoom_not_configured", "zoom_not_connected", "zoom_reconnect_required",
  "zoom_status_failed", "zoom_disconnect_failed", "invalid_origin", "not_authenticated",
]);

export function safeZoomError(value, fallback = "zoom_status_failed") {
  return SAFE_ERRORS.has(value) ? value : fallback;
}

export function zoomReturn(search = "") {
  const params = new URLSearchParams(search);
  if (params.has("zoom_error")) return { error: safeZoomError(params.get("zoom_error")) };
  return params.get("zoom") === "connected" ? { connected: true } : null;
}

export function normalizeZoomStatus(raw) {
  if (!raw || typeof raw.configured !== "boolean" || typeof raw.connected !== "boolean" ||
      typeof raw.rtmsConfigured !== "boolean" || raw.captureMode !== "native_rtms") {
    throw new Error("zoom_status_failed");
  }
  const email = raw.account?.email || raw.email;
  return {
    configured: raw.configured,
    connected: raw.connected,
    email: raw.connected && typeof email === "string" ? email.slice(0, 320) : null,
    rtmsConfigured: raw.rtmsConfigured,
    capabilities: Object.fromEntries(["audio", "video", "screenshare", "transcript"].map(key => [key, raw.connected && raw.capabilities?.[key] === true])),
    // Never infer access to a particular meeting from an account connection.
    meetingAccess: "requires_zoom_permission",
  };
}

export function zoomConnectionState(data) {
  if (!data) return "unknown";
  if (!data.configured) return "configuration_pending";
  if (!data.connected) return "disconnected";
  if (!["audio", "video", "screenshare"].every(key => data.capabilities[key])) return "permissions_missing";
  if (!data.rtmsConfigured) return "rtms_pending";
  return "connected";
}

async function responseJson(response, fallback) {
  let body;
  try { body = await response.json(); } catch { throw new Error(fallback); }
  if (!response.ok) throw new Error(response.status === 401 ? "not_authenticated" : safeZoomError(body?.error, fallback));
  return body;
}

export async function loadZoomStatus(fetcher = fetch, signal) {
  const response = await fetcher("/api/zoom/status", { cache: "no-store", credentials: "same-origin", signal });
  return normalizeZoomStatus(await responseJson(response, "zoom_status_failed"));
}

export async function disconnectZoom(fetcher = fetch) {
  const response = await fetcher("/api/zoom/disconnect", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: "{}",
  });
  const body = await responseJson(response, "zoom_disconnect_failed");
  if (body?.ok !== true || body.connected !== false) throw new Error("zoom_disconnect_failed");
}

export function zoomErrorMessage(code, lang = "en") {
  const es = lang === "es";
  const messages = {
    zoom_not_configured: ["Zoom setup is pending in OctoMeet. Try again once it is available.", "La configuración de Zoom en OctoMeet está pendiente. Reintentá cuando esté disponible."],
    zoom_not_connected: ["Connect your Zoom account to continue.", "Conectá tu cuenta de Zoom para continuar."],
    zoom_reconnect_required: ["Reconnect Zoom to renew your authorization.", "Reconectá Zoom para renovar tu autorización."],
    zoom_status_failed: ["We couldn't check your Zoom connection. Try again.", "No pudimos comprobar tu conexión con Zoom. Reintentá."],
    zoom_disconnect_failed: ["We couldn't confirm disconnection. Refresh status before trying again.", "No pudimos confirmar la desconexión. Actualizá el estado antes de reintentar."],
    invalid_origin: ["Reload OctoMeet and try again.", "Recargá OctoMeet y reintentá."],
    not_authenticated: ["Your OctoMeet session expired. Sign in again to manage Zoom.", "Tu sesión de OctoMeet venció. Volvé a iniciar sesión para gestionar Zoom."],
  };
  return messages[safeZoomError(code)][es ? 1 : 0];
}
