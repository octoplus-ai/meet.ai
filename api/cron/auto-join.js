// Vercel Cron: autonomously arm bots for every auto-join user's upcoming meetings.
// Runs even when nobody has the app open. The own bot joins at each start time.
import { sb } from "../lib/supa.js";
import { armUserCalendar } from "../lib/schedule.js";
import { ensureWatch } from "../lib/calendar-watch.js";
import { sweepRtmsDeletions } from '../lib/rtms-cleanup.js';
import { drainMeetingNotifications } from '../lib/notifications.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    // Auth: Vercel Cron sets x-vercel-cron (external requests can't forge x-vercel-* headers, Vercel
    // strips them). Also accept Bearer CRON_SECRET (manual) or Bearer BOT_INGEST_SECRET - the
    // orchestrator sweeps this endpoint every few minutes so auto-join is near-realtime like Recall.
    const key = new URL(req.url, "http://x").searchParams.get("key");
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const isCron = req.headers["x-vercel-cron"]
      || (process.env.CRON_SECRET && bearer === process.env.CRON_SECRET)
      || (process.env.BOT_INGEST_SECRET && bearer === process.env.BOT_INGEST_SECRET)
      || (process.env.RECALL_WEBHOOK_SECRET && key === process.env.RECALL_WEBHOOK_SECRET);
    if (!isCron) return res.status(401).json({ error: "unauthorized" });

    // A bounded, durable RTMS media cleanup retry. It cannot delete accounts and
    // a temporarily unavailable cleanup service must not block other calendars.
    await sweepRtmsDeletions({ limit: 1 }).catch(() => {});

    if (!process.env.BOT_ORCHESTRATOR_URL) return res.status(503).json({ error: "bot_backend_unavailable" });
    // Match settings/arm-all: null is the enabled default; only explicit false opts out.
    const users = await sb(`app_users?or=(auto_join.eq.true,auto_join.is.null)&select=id,notetaker_name,auto_join`);
    const results = [];
    for (const u of users) {
      try {
        if (u.auto_join === false) continue;
        const r = await armUserCalendar(u.id, { botName: u.notetaker_name || "OctoMeet AI", days: 7 });
        // Keep a live Google Calendar push channel so new meetings arm INSTANTLY (not just on the
        // next sweep). Cheap no-op unless the channel is missing or about to expire.
        const w = await ensureWatch(u.id);
        results.push({ user: u.id, ...r, watch: w && (w.registered ? "registered" : w.fresh ? "fresh" : (w.error ? "error" : w.skipped)) });
      } catch (e) {
        results.push({ user: u.id, error: String(e.message || e) });
      }
    }
    // Calendar admission takes priority over recap retries. These are queued jobs only;
    // existing historical reports are never enumerated or replayed by this sweep.
    await drainMeetingNotifications({ limit: 2, budgetMs: 12000 }).catch(() => {});
    res.status(200).json({ ok: true, users: users.length, results });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
