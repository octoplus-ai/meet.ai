// Google Calendar push receiver. Google POSTs here the instant a calendar changes (create/edit/
// delete) for a calendar we subscribed to via events.watch - we then arm the bot IMMEDIATELY
// (Recall-style), instead of waiting for the poll. Google sends only headers (no useful body);
// we identify + validate the user from the channel token we set at watch time.
import { armUserCalendar } from "../lib/schedule.js";
import { parseWatchToken } from "../lib/calendar-watch.js";
import { sb } from "../lib/supa.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    const state = req.headers["x-goog-resource-state"];
    const userId = parseWatchToken(req.headers["x-goog-channel-token"]);
    // Unknown/invalid channel, or the initial "sync" handshake Google sends on channel creation:
    // just acknowledge so Google doesn't retry. (Non-2xx makes Google hammer retries.)
    if (!userId || state === "sync") return res.status(200).end();

    const u = (await sb(`app_users?id=eq.${encodeURIComponent(userId)}&select=notetaker_name,auto_join`))[0] || {};
    if (u.auto_join !== false) {
      // Arm any new/changed meeting right now. Idempotent (dedup by calendar_event_id + orchestrator
      // dedup by meetingId), so a duplicate push is harmless. Await so it completes before we ack
      // (Vercel freezes the function after the response).
      try { await armUserCalendar(userId, { botName: u.notetaker_name || "OctoMeet AI", days: 7 }); }
      catch (e) { console.error("[cal-webhook] arm error", e && (e.message || e)); }
    }
    return res.status(200).end();
  } catch (e) {
    console.error("[cal-webhook] error", e && (e.message || e));
    return res.status(200).end(); // still ack
  }
}
