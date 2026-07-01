// In-house bot live status updates (secret-auth). The worker/orchestrator posts state transitions
// so the UI shows "recording live", "processing", etc. Never overwrites a finished ("done") meeting.
// POST { secret, meetingId?|botId?, status, error? }  status: joining|in_call|recording|processing|error
import { sb } from "../lib/supa.js";

const enc = encodeURIComponent;
const ALLOWED = ["scheduled", "joining", "in_call", "recording", "processing", "error"];

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const SECRET = process.env.BOT_INGEST_SECRET;
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const given = body.secret || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!SECRET || given !== SECRET) return res.status(401).json({ error: "unauthorized" });
    const status = String(body.status || "");
    if (!ALLOWED.includes(status)) return res.status(400).json({ error: "bad status" });

    let rows = [];
    if (body.meetingId) rows = await sb(`meetings?id=eq.${enc(body.meetingId)}&select=id,status`);
    else if (body.botId) rows = await sb(`meetings?bot_id=eq.${enc(body.botId)}&select=id,status`);
    const m = rows[0];
    if (!m) return res.status(404).json({ error: "meeting not found" });
    if (m.status === "done") return res.status(200).json({ ok: true, skipped: "already done" });

    const patch = { status, status_synced_at: new Date().toISOString() };
    if (status === "error") patch.error = String(body.error || "bot error").slice(0, 300);
    await sb(`meetings?id=eq.${enc(m.id)}`, { method: "PATCH", body: patch });
    res.status(200).json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
