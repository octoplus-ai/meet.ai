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

    const from = new Date(Date.now() - 60 * 60000).toISOString(); // cover meetings that started up to 1h ago (still ongoing)
    const to = new Date(Date.now() + 7 * 86400000).toISOString();
    const staleJoin = Date.now() - 11 * 60000; // a "joining" row older than this = the worker died (join-wait is 10 min)
    const giveUp = Date.now() - 20 * 60000;    // a meeting >20 min past its start never got held - stop re-arming it
    const raw = await sb(
      `meetings?capture_mode=eq.inhouse_bot&status=in.(scheduled,joining)&start_time=gte.${encodeURIComponent(from)}&start_time=lte.${encodeURIComponent(to)}` +
      `&select=id,user_id,meeting_url,start_time,title,bot_id,status,status_synced_at&order=start_time.asc&limit=100`
    );
    // Re-arm scheduled meetings, plus "joining" meetings whose worker DIED (stale) so a failed initial
    // arm POST is self-healed. A fresh/ongoing "joining" (worker still in the lobby) is skipped to avoid
    // booting a duplicate bot. NEVER re-arm a joining row whose start is >20 min past - that meeting was
    // never held (or was rescheduled and abandoned); re-arming it looped a bot into an empty room forever.
    const rows = (raw || []).filter((r) => r.status === "scheduled" ||
      (r.status === "joining" && (r.start_time ? new Date(r.start_time).getTime() > giveUp : true)
        && (!r.status_synced_at || new Date(r.status_synced_at).getTime() < staleJoin)));

    // SAFETY SWEEP: a meeting stuck "in_call"/"recording" whose worker stopped heartbeating (>15 min;
    // the worker re-posts "recording" every 5 min while healthy) either died mid-recording or missed
    // its one-shot "processing" post. Flip it to "processing" so the UI never shows "recording live"
    // forever. A still-uploading worker then posts "done"; a false flip self-corrects on the next
    // heartbeat (bot/status allows processing->recording). Best-effort; never blocks the pending feed.
    try {
      const staleTs = new Date(Date.now() - 15 * 60000).toISOString();
      await sb(`meetings?capture_mode=eq.inhouse_bot&status=in.(in_call,recording)&status_synced_at=lt.${encodeURIComponent(staleTs)}`,
        { method: "PATCH", body: { status: "processing", status_synced_at: new Date().toISOString() } });
    } catch (e) { /* best-effort */ }

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
