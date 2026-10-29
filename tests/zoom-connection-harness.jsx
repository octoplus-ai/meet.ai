// Synthetic requests are intercepted by browser-zoom-connection.mjs; no Zoom navigation.
import React from "react";
import { createRoot } from "react-dom/client";
import ZoomConnection from "../src/integrations/ZoomConnection.jsx";
const lang = new URLSearchParams(window.location.search).get("lang") || "en";
createRoot(document.getElementById("root")).render(<main style={{ maxWidth: 720, padding: 16, margin: "auto" }}><ZoomConnection lang={lang} /></main>);
