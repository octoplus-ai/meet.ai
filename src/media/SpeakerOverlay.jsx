import React, { useEffect, useRef, useState } from "react";
import { Users, RefreshCw } from "lucide-react";
import { bindSpeakerVideo, speakerAvailability } from "./speaker-sync.js";

const COPY = {
  es: { label: "Cámara del hablante", loading: "Cargando cámara…", error: "No se pudo cargar o sincronizar la cámara. Reintentá.", disabled: "La cámara no se capturó en esta reunión.", unavailable: "Cámara del hablante no disponible en esta grabación.", waiting: "La cámara aparece cuando alguien comparte pantalla.", noShares: "No se registró una pantalla compartida en esta reunión.", cameraOff: "La cámara del hablante estaba apagada en este tramo.", noCamera: "No se capturó una cámara visible del hablante en este tramo.", legacy: "Grabación antigua: la cámara y sus intervalos no están verificados. Puede mostrar avatares o tramos incompletos.", partial: "Cámara disponible solo en algunos tramos.", move: "Mover cámara con arrastre o flechas del teclado", retry: "Reintentar cámara" },
  en: { label: "Speaker camera", loading: "Loading camera…", error: "Camera could not load or synchronize. Retry.", disabled: "Camera capture was disabled for this meeting.", unavailable: "Speaker camera is unavailable in this recording.", waiting: "The camera appears while someone shares their screen.", noShares: "No screen sharing was recorded in this meeting.", cameraOff: "The speaker's camera was off at this moment.", noCamera: "No visible speaker camera was captured at this moment.", legacy: "Older recording: camera coverage is unverified. It may show avatars or incomplete intervals.", partial: "Camera is available for part of this recording.", move: "Move camera by dragging or using arrow keys", retry: "Retry camera" },
};
const CORNERS = { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, bl: { x: 0, y: 1 }, br: { x: 1, y: 1 } };

export default function SpeakerOverlay({ mainRef, containerRef, collapsed, time, meetingId, media = {}, language = "en" }) {
  const text = COPY[language] || COPY.en;
  const [enabled, setEnabled] = useState(false);
  const [camera, setCamera] = useState(null);
  const [load, setLoad] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState(CORNERS[media.pipCorner] || CORNERS.br);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const drag = useRef(null);
  const url = media.pipUrl;
  const availability = speakerAvailability(media, time);
  const available = availability.available;
  const visible = enabled && availability.visible;
  const storageKey = `octomeet:speaker-position:${meetingId}`;
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => { const { width } = node.getBoundingClientRect(); const height = mainRef.current?.getBoundingClientRect().height || width * 9 / 16; setBounds({ width, height }); };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(node); if (mainRef.current) observer.observe(mainRef.current);
    return () => observer.disconnect();
  }, [containerRef, mainRef]);

  useEffect(() => {
    setEnabled(false); setLoad("loading");
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { /* storage may be disabled */ }
    setPosition(saved && [saved.x, saved.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) ? saved : (CORNERS[media.pipCorner] || CORNERS.br));
  }, [meetingId, url, storageKey, media.pipCorner]);
  useEffect(() => {
    if (!camera || collapsed || !enabled || !available) return;
    let disposed = false;
    const ready = () => {
      if (!disposed && camera.readyState >= 2 && camera.videoWidth > 0 && camera.videoHeight > 0) setLoad("ready");
    };
    const failed = () => { if (!disposed) setLoad("error"); };
    setLoad("loading");
    camera.addEventListener("loadeddata", ready);
    camera.addEventListener("canplay", ready);
    camera.addEventListener("error", failed);
    ready();
    // A broken URL/decoder must not leave the control in an endless loading state.
    const timer = setTimeout(() => {
      if (camera.readyState < 2 || !camera.videoWidth || !camera.videoHeight) failed();
    }, 15000);
    return () => {
      disposed = true; clearTimeout(timer);
      camera.removeEventListener("loadeddata", ready);
      camera.removeEventListener("canplay", ready);
      camera.removeEventListener("error", failed);
    };
  }, [camera, collapsed, enabled, available]);
  useEffect(() => {
    if (collapsed || !enabled || !camera || !available || load === "error") return;
    return bindSpeakerVideo(mainRef.current, camera, { onError: () => setLoad("error") });
  }, [camera, collapsed, enabled, available, mainRef, load]);

  const savePosition = (next) => {
    setPosition(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* in-memory movement still works */ }
  };
  const finishDrag = () => { if (drag.current) savePosition(drag.current.position || position); drag.current = null; };
  const stateMessage = availability.reason ? text[availability.reason] : "";
  const message = !available ? stateMessage || text.unavailable
    : load === "error" ? text.error : load === "loading" ? text.loading : stateMessage;
  if (collapsed) return null;

  return <>
    <button type="button" aria-label={text.label} aria-pressed={enabled} title={available ? text.label : message}
      onClick={() => setEnabled((value) => !value)}
      className={"absolute right-24 top-3 z-40 flex h-11 w-11 items-center justify-center rounded-lg shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 " + (enabled ? "bg-violet-600 text-white" : "bg-white/90 text-violet-700")}>
      <Users size={18} />
    </button>
    {enabled && message && <div role="status" className="absolute bottom-24 left-3 z-40 max-w-[75%] rounded-lg bg-black/85 px-3 py-2 text-xs text-white">
      {message}
      {available && load === "error" && <button type="button" aria-label={text.retry} onClick={() => { setLoad("loading"); setRetry((value) => value + 1); }} className="ml-2 inline-flex h-11 w-11 items-center justify-center rounded hover:bg-white/20 focus-visible:outline"><RefreshCw size={16} /></button>}
    </div>}
    {enabled && available && <div role="group" tabIndex={visible && load === "ready" ? 0 : -1} aria-label={text.move} aria-hidden={!visible || load !== "ready"}
      data-testid="speaker-overlay"
      className="absolute z-30 w-[26%] max-w-[320px] cursor-grab touch-none overflow-hidden rounded-xl border-2 border-white/80 bg-black shadow-2xl focus-visible:outline-2 focus-visible:outline-violet-400"
      style={{ aspectRatio: "16 / 9", left: 4 + Math.max(0, bounds.width - Math.min(bounds.width * 0.26, 320) - 8) * position.x, top: 60 + Math.max(0, bounds.height - Math.min(bounds.width * 0.26, 320) * 9 / 16 - 144) * position.y, opacity: visible && load === "ready" ? 1 : 0, pointerEvents: visible && load === "ready" ? "auto" : "none" }}
      onKeyDown={(event) => {
        const delta = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[event.key];
        if (!delta) return; event.preventDefault();
        savePosition({ x: Math.max(0, Math.min(1, position.x + delta[0])), y: Math.max(0, Math.min(1, position.y + delta[1])) });
      }}
      onPointerDown={(event) => {
        if (!visible) return;
        const rect = event.currentTarget.getBoundingClientRect();
        drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current || !containerRef.current) return;
        const parent = containerRef.current.getBoundingClientRect(), rect = event.currentTarget.getBoundingClientRect();
        const next = { x: Math.max(0, Math.min(1, (event.clientX - parent.left - drag.current.dx - 4) / Math.max(1, parent.width - rect.width - 8))), y: Math.max(0, Math.min(1, (event.clientY - parent.top - drag.current.dy - 60) / Math.max(1, bounds.height - rect.height - 144))) };
        drag.current.position = next; setPosition(next);
      }} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
      <video key={`${url}:${retry}`} ref={setCamera} src={url} muted playsInline preload="auto"
        className="pointer-events-none h-full w-full object-contain" />
    </div>}
  </>;
}
