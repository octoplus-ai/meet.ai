// Vercel Cron: autonomously arm bots for every auto-join user's upcoming meetings.
// Runs even when nobody has the app open. Recall then joins each at its start time.
import { sb } from "../lib/supa.js";
import { armUserCalendar } from "../lib/schedule.js";

export default async function handler(req, res) {
  try {
    // Allow Vercel Cron (sets x-vercel-cron) or a manual call with the shared key.
    const key = new URL(req.url, "http://x").searchParams.get("key");
    const isCron = req.headers["x-vercel-cron"] || (process.env.RECALL_WEBHOOK_SECRET && key === process.env.RECALL_WEBHOOK_SECRET);
    if (!isCron) return res.status(401).json({ error: "unauthorized" });

    const users = await sb(`app_users?auto_join=eq.true&select=id,notetaker_name`);
    const results = [];
    for (const u of users) {
      try {
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
