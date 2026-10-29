// Development fixture: use the actual CalendarView and its real request/state wiring.
import React from "react";
import { createRoot } from "react-dom/client";
import { CalendarView } from "../src/App.jsx";

window.calendarOpened = [];
createRoot(document.getElementById("root")).render(
  <main className="calendar-fixture">
    <p className="fixture-note">Calendar regression fixture · offline utility CSS, not the production Tailwind build</p>
    <CalendarView initialTab="upcoming" meetings={[]} onAsk={() => {}} onOpen={(id) => window.calendarOpened.push(id)} />
  </main>,
);
