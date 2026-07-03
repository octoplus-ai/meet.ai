// OctoMeet AI - Google Calendar content script.
// Injects a per-event notetaker toggle (before the meeting) and the Read Score +
// report link (after) into the event popup, like Read.ai does.
(() => {
  const APP = "https://meet.octoplusteam.com";
  let lastEventId = null; // most recently clicked event chip (fallback source of the event id)

  // Google encodes data-eventid as base64("<eventId> <calendarEmail>"). Recurring
  // instances decode to ids like "abc_20260703T150000Z" which is exactly what the
  // Calendar API (singleEvents=true) reports, so they match our calendar_event_id.
  function decodeEventId(raw) {
    if (!raw) return null;
    try {
      const dec = atob(raw);
      if (/^[\x20-\x7e]+$/.test(dec)) return dec.split(" ")[0] || null;
    } catch (e) { /* not base64 -> already a raw id */ }
    return raw;
  }

  // Remember which chip the user clicked so the popup (which sometimes lacks the
  // attribute) can still resolve its event id.
  document.addEventListener("click", (e) => {
    const chip = e.target && e.target.closest && e.target.closest("[data-eventid]");
    if (chip) lastEventId = decodeEventId(chip.getAttribute("data-eventid"));
  }, true);

  // Receive the session token from the OAuth popup (same postMessage flow as the Meet add-on).
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (d && d.type === "octomeet-token" && d.token) {
      chrome.runtime.sendMessage({ type: "save-token", token: d.token }, () => {
        document.querySelectorAll(".octomeet-row").forEach((el) => {
          const dlg = el.closest('[role="dialog"]');
          el.remove();
          if (dlg) inject(dlg); // re-render now that we're signed in
        });
      });
    }
  });

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function render(row, eventId, state) {
    row.textContent = "";
    const brand = el("span", "octomeet-brand");
    const logo = el("span", "octomeet-logo", "🐙");
    brand.append(logo, el("span", "octomeet-name", "OctoMeet AI"));
    row.append(brand);

    if (state.needAuth) {
      const btn = el("button", "octomeet-btn", "Conectar OctoMeet");
      btn.addEventListener("click", () => {
        window.open(APP + "/api/auth/google/start?addon=1", "octoauth", "width=480,height=660,menubar=no,toolbar=no");
      });
      row.append(btn);
      return;
    }
    if (state.error) { row.append(el("span", "octomeet-hint", "Sin conexion con OctoMeet")); return; }

    // Post-meeting: Read Score + report link.
    if (state.status === "done") {
      if (state.score != null) {
        const chip = el("span", "octomeet-score", String(state.score));
        chip.title = "Read Score";
        row.append(chip);
      }
      const a = el("a", "octomeet-link", "Ver reporte");
      a.href = state.reportUrl || APP;
      a.target = "_blank";
      a.rel = "noopener";
      row.append(a);
      return;
    }
    if (state.status === "processing" || state.status === "in_call" || state.status === "recording") {
      row.append(el("span", "octomeet-hint", state.status === "processing" ? "Procesando reporte..." : "Grabando ahora"));
      return;
    }

    // Pre-meeting: the toggle.
    const label = el("label", "octomeet-switch");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = state.enabled !== false;
    const slider = el("span", "octomeet-slider");
    label.append(input, slider);
    const hint = el("span", "octomeet-hint", input.checked ? "El notetaker se unira" : "Desactivado para esta reunion");
    input.addEventListener("change", () => {
      const enable = input.checked;
      hint.textContent = "Guardando...";
      input.disabled = true;
      chrome.runtime.sendMessage({ type: "toggle", eventId, enable }, (r) => {
        input.disabled = false;
        if (!r || r.error || r.ok === false) {
          input.checked = !enable; // revert
          hint.textContent = (r && (r.detail || r.error)) || "No se pudo guardar";
          return;
        }
        hint.textContent = enable ? "El notetaker se unira" : "Desactivado para esta reunion";
      });
    });
    row.append(label, hint);
  }

  function inject(dialog) {
    if (dialog.querySelector(".octomeet-row")) return;
    // Only meeting popups: require a Meet/Zoom/Teams link or a video button inside.
    const html = dialog.innerHTML || "";
    if (!/meet\.google\.com|zoom\.us\/j\/|teams\.microsoft\.com/i.test(html)) return;
    const withId = dialog.closest("[data-eventid]") || dialog.querySelector("[data-eventid]");
    const eventId = decodeEventId(withId && withId.getAttribute("data-eventid")) || lastEventId;
    if (!eventId) return;

    const row = el("div", "octomeet-row");
    row.append(el("span", "octomeet-hint", "Cargando OctoMeet..."));
    dialog.appendChild(row);
    chrome.runtime.sendMessage({ type: "state", eventId }, (state) => {
      if (!row.isConnected) return;
      render(row, eventId, state || { error: "no response" });
    });
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const dlg = n.matches && n.matches('[role="dialog"]') ? n : n.querySelector && n.querySelector('[role="dialog"]');
        if (dlg) setTimeout(() => inject(dlg), 250); // let gcal finish painting the popup
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
