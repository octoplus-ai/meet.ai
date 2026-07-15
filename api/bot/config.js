// Bot runtime config: the worker fetches per-meeting recording settings at boot (secret-authed,
// read-only). Currently just the "training PiP" toggle (show the active speaker's camera over a
// screen share). Isolated + fail-safe: any error returns the safe default so the bot is never blocked.
import { sb } from "../lib/supa.js";

const enc = encodeURIComponent;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const SECRET = process.env.BOT_INGEST_SECRET;
    const given = req.headers["x-bot-ingest-secret"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || (req.query && req.query.secret) || "";
    if (!SECRET || given !== SECRET) return res.status(401).json({ error: "unauthorized" });

    const meetingId = (req.query && req.query.meetingId) || "";
    if (!meetingId) return res.status(400).json({ error: "meetingId required" });

    const rows = await sb(`meetings?id=eq.${enc(meetingId)}&select=user_id`);
    const uid = rows[0] && rows[0].user_id;
    let pipDuringShare = true; // ON for all meetings by default
    if (uid) {
      const u = await sb(`app_users?id=eq.${enc(uid)}&select=sharing_prefs`);
      const prefs = (u[0] && u[0].sharing_prefs && typeof u[0].sharing_prefs === "object") ? u[0].sharing_prefs : {};
      pipDuringShare = prefs.pipDuringShare !== false; // only OFF if the owner explicitly disabled capture
    }
    return res.status(200).json({ pipDuringShare });
  } catch (e) {
    return res.status(200).json({ pipDuringShare: true }); // default ON; a config read must never block the bot
  }
}
