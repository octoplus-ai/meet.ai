// Sends a Recall.ai bot into a meeting URL (now or scheduled). Thin wrapper over
// the shared scheduleBot helper so manual + auto-join share one code path.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { scheduleBot } from "../lib/schedule.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    // Accept the session token via Authorization: Bearer, body.token, or cookie.
    // (The Meet add-on panel runs in a partitioned iframe where the cookie isn't sent.)
    const auth = req.headers.authorization || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    const t = bearer || body.token || parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });

    if (!body.meetingUrl) return res.status(400).json({ error: "meetingUrl required" });
    // In-house bot (BOT_ORCHESTRATOR_URL) is the active path; Recall is only a fallback.
    if (!process.env.BOT_ORCHESTRATOR_URL && !process.env.RECALL_API_KEY) return res.status(400).json({ error: "No bot backend configured (set BOT_ORCHESTRATOR_URL or RECALL_API_KEY)" });

    const result = await scheduleBot(s[0].user_id, {
      meetingUrl: body.meetingUrl, title: body.title, joinAt: body.joinAt,
      calendarEventId: body.calendarEventId, botName: body.botName,
    });
    if (result.error) return res.status(502).json({ error: result.error, detail: result.detail });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
