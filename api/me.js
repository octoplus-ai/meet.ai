// Returns the current logged-in user (from the session cookie), or null.
// Also flags whether the Gmail send permission is granted, so the app can prompt for a
// one-click reconnect (instead of failing silently when sharing by email).
import { currentUser } from "./lib/session.js";
import { sb } from "./lib/supa.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const user = await currentUser(req);
    if (user) {
      try {
        const tk = await sb(`oauth_tokens?user_id=eq.${user.id}&provider=eq.google&select=scope`);
        user.gmailReady = !!(tk[0] && tk[0].scope && tk[0].scope.includes("gmail.send"));
      } catch (e) { /* ignore - leave gmailReady undefined */ }
    }
    res.status(200).json({ user });
  } catch (e) {
    console.error("/api/me error:", e && (e.message || e));
    res.status(200).json({ user: null });
  }
}
