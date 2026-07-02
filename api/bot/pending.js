// In-house bot reconciliation feed (secret-auth). Returns every scheduled inhouse-bot meeting
// that should have an armed worker (start within [now-15min, now+7d]). The orchestrator polls
// this on startup + every few minutes so scheduled meetings SURVIVE orchestrator restarts and
// a failed "arm" POST is self-healed. Source of truth = the meetings table.
import { sb } from "../lib/supa.js";

export default async function handler(req, res) {
  try {
    const SECRET = process.env.BOT_INGEST_SECRET;
    const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || req.headers["x-bot-ingest-secret"] || "";
    if (!SECRET || given !== SECRET) return res.status(401).json({ error: "unauthorized" });

    const from = new Date(Date.now() - 15 * 60000).toISOString();
    const to = new Date(Date.now() + 7 * 86400000).toISOString();
    const rows = await sb(
      `meetings?capture_mode=eq.inhouse_bot&status=eq.scheduled&start_time=gte.${encodeURIComponent(from)}&start_time=lte.${encodeURIComponent(to)}` +
      `&select=id,user_id,meeting_url,start_time,title,bot_id&order=start_time.asc&limit=100`
    );

    // Resolve each owner's notetaker display name (best-effort).
    const uids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    const names = {};
    if (uids.length) {
      const us = await sb(`app_users?id=in.(${uids.map(encodeURIComponent).join(",")})&select=id,notetaker_name`).catch(() => []);
      (us || []).forEach((u) => { names[u.id] = u.notetaker_name || ""; });
    }

    res.status(200).json({
      pending: rows.map((r) => ({
        meetingId: r.id, botId: r.bot_id, userId: r.user_id, meetingUrl: r.meeting_url,
        joinAt: r.start_time, title: r.title || "", botName: names[r.user_id] || "OctoMeet AI",
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
