// Google Calendar push (watch) channels: get calendar changes delivered INSTANTLY to our webhook
// (Recall-style) instead of waiting for the poll. We register one channel per auto-join user on
// their primary calendar; Google then POSTs to /api/calendar/google-webhook the moment an event is
// created/edited/deleted, and we arm the bot right away. The 15s sweep stays as a fallback.
//
// No schema change: the channel is stored inside the existing app_users.integrations jsonb under
// `calWatch`. The channel `token` (echoed back on every push) is `${SECRET}:${userId}` so the
// webhook can identify + validate the user with no DB lookup.
import { sb } from "./supa.js";
import { getValidToken } from "./google.js";

const WEBHOOK_BASE = (process.env.CALENDAR_WEBHOOK_BASE || "https://meet.octoplusteam.com").replace(/\/+$/, "");
export const WEBHOOK_URL = WEBHOOK_BASE + "/api/calendar/google-webhook";
const WATCH_SECRET = process.env.CALENDAR_WATCH_SECRET || process.env.BOT_INGEST_SECRET || "";

export function watchToken(userId) { return `${WATCH_SECRET}:${userId}`; }
export function parseWatchToken(token) {
  const s = String(token || "");
  const i = s.indexOf(":");
  if (i < 0) return null;
  const secret = s.slice(0, i), userId = s.slice(i + 1);
  if (!WATCH_SECRET || secret !== WATCH_SECRET || !userId) return null;
  return userId;
}

// Register (or renew) the push channel. Idempotent + cheap: only (re)registers when there is no live
// channel or it expires within 24h, so it's a no-op on almost every sweep.
export async function ensureWatch(userId) {
  try {
    if (!WATCH_SECRET) return { skipped: "no secret" };
    const rows = await sb(`app_users?id=eq.${encodeURIComponent(userId)}&select=integrations`);
    const u = rows[0]; if (!u) return { skipped: "no user" };
    const ints = (u.integrations && typeof u.integrations === "object") ? u.integrations : {};
    const cur = ints.calWatch;
    const now = Date.now();
    if (cur && cur.expiration && Number(cur.expiration) - now > 24 * 3600 * 1000) return { ok: true, fresh: true };

    const token = await getValidToken(userId);
    if (!token) return { skipped: "no google token" };

    const channelId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || ("ch_" + Math.random().toString(36).slice(2) + now.toString(36));
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/watch", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: channelId, type: "web_hook", address: WEBHOOK_URL, token: watchToken(userId), params: { ttl: "604800" } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("[calendar-watch] watch failed", res.status, JSON.stringify(data).slice(0, 400)); return { error: (data && data.error) || res.status }; }

    // Stop the previous channel (best-effort) so renewals don't leak stale channels.
    if (cur && cur.channelId && cur.resourceId) {
      fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: cur.channelId, resourceId: cur.resourceId }),
      }).catch(() => {});
    }

    const calWatch = { channelId, resourceId: data.resourceId, expiration: Number(data.expiration) || (now + 7 * 86400000), at: new Date().toISOString() };
    await sb(`app_users?id=eq.${encodeURIComponent(userId)}`, { method: "PATCH", body: { integrations: { ...ints, calWatch } } });
    console.log("[calendar-watch] registered channel for", userId, "expires", new Date(calWatch.expiration).toISOString());
    return { ok: true, registered: true };
  } catch (e) {
    console.error("[calendar-watch] ensureWatch error", e && (e.message || e));
    return { error: String(e.message || e) };
  }
}
