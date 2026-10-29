import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Video } from "lucide-react";
import { ZOOM_CONNECT_URL, ZOOM_SETTINGS_URL, disconnectZoom, loadZoomStatus, safeZoomError, zoomConnectionState, zoomErrorMessage, zoomReturn } from "./zoom-connection.js";

export default function ZoomConnection({ lang = "en", icon }) {
  const es = lang === "es";
  const headingId = useId();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [callbackError, setCallbackError] = useState(() => typeof window !== "undefined" ? zoomReturn(window.location.search)?.error || "" : "");
  const request = useRef({ sequence: 0, controller: null });
  const mounted = useRef(true);

  const refresh = useCallback(async (clearCallback = true) => {
    const sequence = ++request.current.sequence;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    setLoading(true);
    setError("");
    setNotice("");
    if (clearCallback) setCallbackError("");
    try {
      const status = await loadZoomStatus(fetch, controller.signal);
      if (mounted.current && sequence === request.current.sequence) setData(status);
    } catch (failure) {
      if (mounted.current && sequence === request.current.sequence && failure?.name !== "AbortError") {
        setError(safeZoomError(failure?.message));
      }
    } finally {
      if (mounted.current && sequence === request.current.sequence) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const url = new URL(window.location.href);
    if (zoomReturn(url.search)) {
      // Consume only our callback parameters; preserve report links and other app state.
      url.searchParams.delete("zoom");
      url.searchParams.delete("zoom_error");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    refresh(false);
    return () => { mounted.current = false; request.current.sequence++; request.current.controller?.abort(); };
  }, [refresh]);

  const disconnect = async () => {
    if (busy) return;
    setBusy(true); setError(""); setCallbackError(""); setNotice("");
    request.current.sequence++;
    request.current.controller?.abort();
    setLoading(false);
    try {
      await disconnectZoom();
      if (!mounted.current) return;
      setData(previous => previous && ({ ...previous, connected: false, email: null, capabilities: { audio: false, video: false, screenshare: false, transcript: false } }));
      setNotice("disconnected");
    } catch (failure) {
      if (mounted.current) setError(safeZoomError(failure?.message, "zoom_disconnect_failed"));
    } finally { if (mounted.current) setBusy(false); }
  };

  const state = zoomConnectionState(data);
  const copy = {
    unknown: ["Connection not verified", "Conexión sin verificar"],
    configuration_pending: ["Setup pending", "Configuración pendiente"],
    disconnected: ["Not connected", "Sin conectar"],
    permissions_missing: ["Authorization needs updating", "Falta actualizar la autorización"],
    rtms_pending: ["Account connected · recording setup pending", "Cuenta conectada · grabación pendiente de configurar"],
    connected: ["Account connected", "Cuenta conectada"],
  };
  const details = {
    unknown: ["Refresh to check the connection.", "Actualizá para comprobar la conexión."],
    configuration_pending: ["The Zoom integration is being prepared in OctoMeet. You can connect your account when it is available.", "La integración de Zoom se está preparando en OctoMeet. Podrás conectar tu cuenta cuando esté disponible."],
    disconnected: ["Authorize your Zoom account so OctoMeet can request access to meeting content.", "Autorizá tu cuenta de Zoom para que OctoMeet pueda solicitar acceso al contenido de tus reuniones."],
    permissions_missing: ["Some required Zoom content permissions are missing. Reconnect and review access to audio, video and screen sharing.", "Faltan permisos de contenido de Zoom. Reconectá y revisá el acceso al audio, video y pantalla compartida."],
    rtms_pending: ["Your account is authorized. OctoMeet still needs to finish setting up Zoom recording.", "Tu cuenta está autorizada. OctoMeet todavía debe completar la configuración de grabación de Zoom."],
    connected: ["In Zoom, enable OctoMeet auto-start for meetings you host and attend, including external meetings. Zoom and the host must allow content access.", "En Zoom, activá el inicio automático de OctoMeet para las reuniones que organizás y a las que asistís, incluidas las externas. Zoom y el anfitrión deben permitir el acceso al contenido."],
  };
  const text = pair => pair[es ? 1 : 0];
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-60";
  const canConnect = data?.configured && (!data.connected || state === "permissions_missing" || error === "zoom_reconnect_required");
  const visibleError = error || callbackError;

  return <section aria-labelledby={headingId} aria-busy={loading || busy} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200">{icon || <Video size={20} className="text-blue-600" aria-hidden="true" />}</div>
      <div className="min-w-0 flex-1">
        <h3 id={headingId} className="text-sm font-semibold text-slate-900">Zoom</h3>
        <div role="status" aria-live="polite" className="mt-1 flex items-center gap-2 text-sm text-slate-700">
          {loading ? <><Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{es ? "Comprobando conexión…" : "Checking connection…"}</> : <>
            {data?.connected && !error ? <CheckCircle2 size={15} className="shrink-0 text-emerald-700" aria-hidden="true" /> : <AlertTriangle size={15} className="shrink-0 text-amber-700" aria-hidden="true" />}
            <span>{error ? (es ? "No se pudo verificar la conexión" : "Connection could not be verified") : text(copy[state])}</span>
          </>}
        </div>
        {data?.email && <p className="mt-1 break-words text-sm text-slate-600">{data.email}</p>}
      </div>
    </div>
    {!loading && !error && <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600">{text(details[state])}</p>}
    {visibleError && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">{zoomErrorMessage(visibleError, lang)}</p>}
    {notice === "disconnected" && <p role="status" className="mt-3 text-sm text-slate-700">{es ? "Zoom desconectado de OctoMeet." : "Zoom disconnected from OctoMeet."}</p>}
    {data?.connected && <>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        {es ? "Permisos otorgados: " : "Granted permissions: "}
        {[data.capabilities.audio && "audio", data.capabilities.video && "video", data.capabilities.screenshare && (es ? "pantalla compartida" : "screen sharing"), data.capabilities.transcript && (es ? "transcripción" : "transcript")].filter(Boolean).join(", ") || (es ? "sin acceso al contenido" : "no content access")}
      </p>
      {data.capabilities.audio && <p className="mt-2 text-xs leading-relaxed text-slate-600">{es ? "OctoMeet transcribe el audio capturado." : "OctoMeet transcribes the captured audio."}</p>}
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{es ? "La conexión no confirma que una reunión se esté grabando. Verás el progreso y el resultado en Calendario y Reportes." : "A connection does not confirm that a meeting is being recorded. Check Calendar and Reports for its progress and result."}</p>
    </>}
    <div className="mt-4 flex flex-wrap gap-2">
      {!loading && !busy && canConnect && <a href={ZOOM_CONNECT_URL} className={button + " bg-violet-600 text-white hover:bg-violet-700"}>{data.connected ? (es ? "Reconectar Zoom" : "Reconnect Zoom") : (es ? "Conectar Zoom" : "Connect Zoom")}</a>}
      {!loading && !busy && data?.connected && data.rtmsConfigured && <a href={ZOOM_SETTINGS_URL} target="_blank" rel="noopener noreferrer" className={button + " border border-slate-300 text-slate-700 hover:bg-slate-50"}>{es ? "Configurar inicio automático en Zoom" : "Set up auto-start in Zoom"}</a>}
      <button type="button" disabled={loading || busy} onClick={refresh} className={button + " border border-slate-300 text-slate-700 hover:bg-slate-50"}><RefreshCw size={15} aria-hidden="true" />{es ? "Actualizar estado" : "Refresh status"}</button>
      {data?.connected && <button type="button" disabled={loading || busy} onClick={disconnect} className={button + " border border-slate-300 text-slate-700 hover:bg-slate-50"}>{busy ? (es ? "Desconectando…" : "Disconnecting…") : (es ? "Desconectar Zoom" : "Disconnect Zoom")}</button>}
    </div>
  </section>;
}
