// OctoMeet AI - background service worker.
// The content script can't call meet.octoplusteam.com directly (page CORS), so all API
// traffic goes through here: with host_permissions the extension context skips CORS.
const APP = "https://meet.octoplusteam.com";

async function api(path, opts = {}) {
  const { octomeet_token: tok } = await chrome.storage.local.get("octomeet_token");
  if (!tok) return { needAuth: true };
  try {
    const r = await fetch(APP + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, ...(opts.headers || {}) },
    });
    if (r.status === 401) { await chrome.storage.local.remove("octomeet_token"); return { needAuth: true }; }
    return await r.json().catch(() => ({}));
  } catch (e) {
    return { error: String(e && e.message) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "state") {
      sendResponse(await api("/api/event-bot?eventId=" + encodeURIComponent(msg.eventId)));
    } else if (msg.type === "toggle") {
      sendResponse(await api("/api/event-bot", { method: "POST", body: JSON.stringify({ eventId: msg.eventId, enable: msg.enable }) }));
    } else if (msg.type === "save-token") {
      await chrome.storage.local.set({ octomeet_token: msg.token });
      sendResponse({ ok: true });
    } else if (msg.type === "logout") {
      await chrome.storage.local.remove("octomeet_token");
      sendResponse({ ok: true });
    } else {
      sendResponse({});
    }
  })();
  return true; // keep the channel open for the async response
});
