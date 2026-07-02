// Vercel Cron: autonomously arm bots for every auto-join user's upcoming meetings.
// Runs even when nobody has the app open. Recall then joins each at its start time.
import { sb } from "../lib/supa.js";
import { armUserCalendar } from "../lib/schedule.js";

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

    const users = await sb(`app_users?auto_join=eq.true&select=id,notetaker_name,recall_calendar_id`);
    const results = [];
    for (const u of users) {
      try {
        // Recall-Calendar users are handled by the calendar webhook (V2) — skip V1 to avoid
        // duplicates. IGNORED in in-house mode: the own bot arms straight from Google Calendar.
        if (u.recall_calendar_id && !process.env.BOT_ORCHESTRATOR_URL) { results.push({ user: u.id, via: "recall_calendar", armed: 0 }); continue; }
        const r = await armUserCalendar(u.id, { botName: u.notetaker_name || "OctoMeet AI", days: 7 });
        results.push({ user: u.id, ...r });
      } catch (e) {
        results.push({ user: u.id, error: String(e.message || e) });
      }
    }
    res.status(200).json({ ok: true, users: users.length, results });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
