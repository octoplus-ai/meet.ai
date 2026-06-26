// Cookie + session helpers (no deps).
import { sb } from "./supa.js";

export function parseCookies(req) {
  const h = req.headers.cookie || "";
  return Object.fromEntries(
    h.split(";").map((c) => c.trim().split("=").map(decodeURIComponent)).filter((a) => a[0])
  );
}

export function randomToken() {
  const a = new Uint8Array(24);
  globalThis.crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns the current user row from the om_session cookie, or null.
export async function currentUser(req) {
  const c = parseCookies(req);
  const t = c.om_session;
  if (!t) return null;
  const s = await sb(`sessions?token=eq.${encodeURIComponent(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  if (!s.length) return null;
  const u = await sb(`app_users?id=eq.${s[0].user_id}&select=*`);
  return u[0] || null;
}
