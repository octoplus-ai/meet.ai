// Diagnostic lookup (secret-authed, read-only). Returns recent in-house-bot meetings with their status,
// error, and whether a report was persisted - so an operator can see why a meeting didn't produce a report
// when the Supabase console/connector isn't available. Same auth + data exposure as /api/bot/pending.
import { sb } from "../lib/supa.js";

const enc = encodeURIComponent;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const SECRET = process.env.BOT_INGEST_SECRET;
    const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || req.headers["x-bot-ingest-secret"] || (req.query && req.query.secret) || "";
    if (!SECRET || given !== SECRET) return res.status(401).json({ error: "unauthorized" });

    const q = (req.query && req.query.q) || "";
    const filter = q ? `&title=ilike.*${enc(q)}*` : "";
    const rows = await sb(
      `meetings?capture_mode=eq.inhouse_bot${filter}&select=id,title,status,start_time,end_time,error,recording_url,status_synced_at&order=start_time.desc&limit=15`
    );
    const ids = (rows || []).map((r) => r.id);
    let reportIds = new Set();
    if (ids.length) {
      const reps = await sb(`reports?meeting_id=in.(${ids.map(enc).join(",")})&select=meeting_id`).catch(() => []);
      reportIds = new Set((reps || []).map((r) => r.meeting_id));
    }
    res.status(200).json({
      meetings: (rows || []).map((r) => ({
        id: r.id, title: r.title, status: r.status, start_time: r.start_time, end_time: r.end_time,
        error: r.error || null, hasReport: reportIds.has(r.id), hasRecordingUrl: !!r.recording_url,
        status_synced_at: r.status_synced_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
