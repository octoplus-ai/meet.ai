// Development-only fixture: exercise the actual player, not a copy of its markup.
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { MeetingVideo } from "../src/App.jsx";


const markers = [
  { at: 0, type: "chapter", label: "Inicio de la reunión: objetivos y presentación del proyecto" },
  { at: 30, type: "highlight", label: "Se aprobó la propuesta para la próxima etapa del proyecto" },
  { at: 60, type: "question", label: "¿Cuándo comienza la siguiente etapa?" },
  { at: 90, type: "action", label: "Preparar el cronograma y compartirlo con el equipo" },
  { at: 120, type: "chapter", label: "Cierre de la reunión: próximos pasos, responsables y fechas de entrega" },
];
function Harness() {
  const videoRef = useRef(null);
  const [mode, setMode] = useState("legacy");
  window.setPresenterFixture = setMode;
  const presenterMedia = mode === "legacy"
    ? { pipUrl: "/tests/legacy-camera-must-not-load.mp4", shareIntervals: [[0, 120]] }
    : { pipUrl: "/tests/modern-camera-must-not-load.mp4", pipStatus: "available", pipIntervals: [[0, 120]], shareIntervals: [[0, 120]] };
  return <main data-fixture-mode={mode} style={{ margin: 12, maxWidth: 1000 }}>
    <h1 style={{ marginBottom: 16 }}>Timeline hover regression</h1>
    <MeetingVideo videoRef={videoRef} src="/tests/timeline-fixture.webm" coverDone coverAt={0.01}
      markers={markers} turns={[]} durationMin={2} meetingId="synthetic"
      presenterMedia={presenterMedia} pipUrl={presenterMedia.pipUrl} shareIntervals={presenterMedia.shareIntervals} />
    <button style={{ marginTop: 24 }}>Outside player</button>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
