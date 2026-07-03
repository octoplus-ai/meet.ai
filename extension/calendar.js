// OctoMeet AI - Google Calendar content script.
// Injects (1) a per-event notetaker toggle + Read Score + report link into the event popup and
// (2) score chips onto the event blocks in the calendar grid - like Read.ai does.
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
        stateCache.clear();
        scanGrid();
      });
    }
  });

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- Event popup: toggle before the meeting, score + report link after ----------

  function costLine(state) {
    // Read.ai's "1 hr x 4 guests = 4 hours total time" line.
    if (!state || !state.durationMin || !state.guestCount) return null;
    const mins = state.durationMin, g = Math.max(1, state.guestCount);
    const each = mins >= 60 ? `${Math.round((mins / 60) * 10) / 10} hr` : `${mins} min`;
    const totMin = mins * g;
    const tot = totMin >= 60 ? `${Math.round((totMin / 60) * 10) / 10} hours` : `${totMin} minutes`;
    return `${each} x ${g} guest${g > 1 ? "s" : ""} = ${tot} total time`;
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

    // Pre-meeting: the toggle (+ the total-time cost line when we know the event).
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
    const cost = costLine(state);
    if (cost) {
      const line = el("div", "octomeet-cost", cost);
      row.appendChild(line);
      row.classList.add("octomeet-row-tall");
    }
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

  // ---------- Calendar grid: score chips on the event blocks (Read.ai parity) ----------

  const stateCache = new Map(); // eventId -> { score, status } (session-lived; cleared on login)
  let scanTimer = null;
  let authKnownBad = false; // don't hammer the API while signed out; popup offers Connect

  function paintChip(node, eventId) {
    const st = stateCache.get(eventId);
    if (!st || st.status !== "done" || st.score == null) return;
    if (node.querySelector(":scope > .octomeet-grid-chip")) return;
    const chip = el("span", "octomeet-grid-chip", String(st.score));
    chip.title = "OctoMeet Read Score";
    node.prepend(chip);
  }

  function scanGrid() {
    if (authKnownBad) return;
    const nodes = [...document.querySelectorAll("[data-eventid]")].filter((n) => n.offsetParent !== null);
    const byId = new Map();
    for (const n of nodes) {
      const id = decodeEventId(n.getAttribute("data-eventid"));
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(n);
    }
    const unknown = [...byId.keys()].filter((id) => !stateCache.has(id)).slice(0, 100);
    const paintAll = () => { for (const [id, ns] of byId) ns.forEach((n) => paintChip(n, id)); };
    if (!unknown.length) { paintAll(); return; }
    chrome.runtime.sendMessage({ type: "states", eventIds: unknown }, (r) => {
      if (!r || r.needAuth) { authKnownBad = !!(r && r.needAuth); return; }
      const states = r.states || {};
      for (const id of unknown) stateCache.set(id, states[id] || { status: "none" });
      paintAll();
    });
  }
  const queueScan = () => { clearTimeout(scanTimer); scanTimer = setTimeout(scanGrid, 900); };

  const mo = new MutationObserver((muts) => {
    let sawGridChange = false;
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const dlg = n.matches && n.matches('[role="dialog"]') ? n : n.querySelector && n.querySelector('[role="dialog"]');
        if (dlg) setTimeout(() => inject(dlg), 250); // let gcal finish painting the popup
        if (n.matches && (n.matches("[data-eventid]") || (n.querySelector && n.querySelector("[data-eventid]")))) sawGridChange = true;
      }
    }
    if (sawGridChange) queueScan();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  queueScan();
})();
