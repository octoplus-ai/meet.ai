import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DangerZone } from "../src/App.jsx";
import PendingDeletions from "../src/media/PendingDeletions.jsx";
import { requestDeletion } from "../src/media/deletion.js";
function MeetingFixture() {
  const [items, setItems] = useState([{ id: '33333333-3333-4333-8333-333333333333' }]);
  return <PendingDeletions items={items} onComplete={async id => {
    const result = await requestDeletion('/api/meeting-delete', { meetingId: id });
    if (!result.pending) setItems([]);
  }} />;
}
createRoot(document.getElementById("root")).render(new URLSearchParams(window.location.search).has('meeting') ? <MeetingFixture /> : <DangerZone email="owner@example.invalid" />);
