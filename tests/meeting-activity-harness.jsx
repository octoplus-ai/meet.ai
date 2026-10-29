// Synthetic data only. Requests are intercepted by browser-meeting-activity.mjs.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReportsList } from "../src/App.jsx";
const now = Date.now();
const meeting = (id, title, status, extra = {}) => ({
  id, title, real: true, status, source: "Zoom", date: new Date(now).toISOString().slice(0, 10),
  at: now, syncedAt: now, timeStart: "11:50 AM", timeEnd: "12:00 PM", folders: ["Meetings"],
  participants: [], contacts: [], scores: { overall: 80 }, ...extra,
});
const fixtures = [
  meeting("join-failed", "OctoMeet 11:50", "error", { error: "JOIN_REQUEST_NOT_REGISTERED" }),
  meeting("saved", "Recording saved without report", "error", { error: "RECORDING_FAILED", savedRecording: "/api/media/fixture.mp4" }),
  meeting("private", "Provider unavailable", "error", { error: "private-token-fixture https://fixture.invalid/?secret=fixture" }),
  meeting("more", "Older failed meeting", "error", { at: now - 86400000, error: "ADMISSION_TIMEOUT" }),
  meeting("processing", "Processing meeting fixture", "processing", { savedRecording: "/api/media/processing-fixture.mp4" }),
  meeting("done", "Completed report fixture", "done"),
];
window.activityOpened = [];
window.activityRefreshes = 0;
function Harness() {
  const [meetings, setMeetings] = useState(fixtures);
  return <main className="calendar-fixture">
    <p className="fixture-note">Reports regression fixture · synthetic data · offline utility CSS, not production Tailwind</p>
    <button className="fixture-note" onClick={() => setMeetings(fixtures.map(m => m.status === "processing" ? { ...m, syncedAt: now - 31 * 60000 } : m))}>Load delayed fixture</button>
    <ReportsList meetings={meetings} t={key => ({ reportsTab: "Reports", allReports: "All Reports", source: "Source", folder: "Folder", anytime: "Anytime", upload: "Upload", autoShareParticipants: "Auto-share with participants" }[key] || key)}
      onOpen={id => window.activityOpened.push(id)} onRefresh={() => window.activityRefreshes++} onAsk={() => {}} onUpload={() => {}} />
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
