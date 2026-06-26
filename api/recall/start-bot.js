// Sends a Recall.ai bot into a meeting URL to join + record + transcribe.
// Stores a "joining" meeting row; the transcript arrives later via webhook.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";

const RECALL_BASE = process.env.RECALL_REGION_URL || "https://us-west-2.recall.ai";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const userId = s[0].user_id;

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const meetingUrl = body.meetingUrl;
    if (!meetingUrl) return res.status(400).json({ error: "meetingUrl required" });
    if (!process.env.RECALL_API_KEY) return res.status(400).json({ error: "RECALL_API_KEY not configured in Vercel" });

    const r = await fetch(`${RECALL_BASE}/api/v1/bot/`, {
      method: "POST",
      headers: { Authorization: `Token ${process.env.RECALL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: "OctoMeet AI Notetaker",
        recording_config: { transcript: { provider: { meeting_captions: {} } } },
      }),
    });
    const bot = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "recall error", detail: bot });

    const m = await sb("meetings", {
      method: "POST",
      prefer: "return=representation",
      body: { user_id: userId, title: body.title || "Live meeting", source: "Recall", meeting_url: meetingUrl, bot_id: bot.id, status: "joining" },
    });
    res.status(200).json({ ok: true, bot_id: bot.id, meeting: m[0] });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
