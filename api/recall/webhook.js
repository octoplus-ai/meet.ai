// Recall.ai webhook: fires when a bot finishes / transcript is ready.
// Fetches the transcript, analyzes it with Claude, and saves a full report.
import { sb } from "../lib/supa.js";

const RECALL_BASE = process.env.RECALL_REGION_URL || "https://us-west-2.recall.ai";

async function analyze(transcriptText, title) {
  const sys =
    "You are a meeting-intelligence analyst. Read the transcript and return ONLY a JSON object (no markdown) with this shape:\n" +
    `{"summary": string (3-4 sentences), "topics": string[] (max 6), "keyQuestions": string[] (max 5), "actionItems": [{"owner": string, "task": string}] (max 8), "scores": {"overall": int, "engagement": int, "sentiment": int} (0-100)}.\n` +
    "Infer owners from the transcript. Keep strings short.";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: sys,
      messages: [{ role: "user", content: `Title: ${title}\n\nTranscript:\n${(transcriptText || "").slice(0, 40000)}` }],
    }),
  });
  const d = await r.json();
  let text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b >= 0) text = text.slice(a, b + 1);
  try { return JSON.parse(text); } catch { return { summary: "(analysis unavailable)", topics: [], keyQuestions: [], actionItems: [], scores: {} }; }
}

export default async function handler(req, res) {
  try {
    // Shared-secret guard: configure the Recall webhook URL with ?key=RECALL_WEBHOOK_SECRET.
    const key = new URL(req.url, "http://x").searchParams.get("key");
    if (process.env.RECALL_WEBHOOK_SECRET && key !== process.env.RECALL_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const ev = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const botId = ev?.data?.bot_id || ev?.bot?.id || ev?.data?.bot?.id || ev?.data?.data?.bot?.id || ev?.data?.id;
    const type = ev?.event || ev?.type || "";
    if (!botId) return res.status(200).json({ ok: true, ignored: true });
    // Only act when the TRANSCRIPT is ready. Other "*.done" events (bot/recording)
    // fire before the transcript exists and would create an empty report.
    const isTranscriptDone = /transcript[._-]?(done|complete|completed)/i.test(type);
    if (type && !isTranscriptDone) return res.status(200).json({ ok: true, skipped: type });

    const meetings = await sb(`meetings?bot_id=eq.${botId}&select=*`);
    const meeting = meetings[0];
    if (!meeting) return res.status(200).json({ ok: true, noMeeting: true });
    // Avoid double-processing.
    if (meeting.status === "done") return res.status(200).json({ ok: true, alreadyDone: true });

    let text = "";
    try {
      const tr = await fetch(`${RECALL_BASE}/api/v1/bot/${botId}/transcript/`, { headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` } });
      const segs = await tr.json();
      if (Array.isArray(segs)) {
        text = segs.map((s) => `${s.speaker || "Speaker"}: ${s.words ? s.words.map((w) => w.text).join(" ") : (s.text || "")}`).join("\n");
      }
    } catch (e) { /* transcript fetch failed */ }

    const ai = await analyze(text, meeting.title);
    // Insert the report. A UNIQUE(meeting_id) constraint dedupes racing deliveries.
    try {
      await sb("reports", {
        method: "POST",
        body: {
          meeting_id: meeting.id, user_id: meeting.user_id,
          summary: ai.summary || "", action_items: ai.actionItems || [], key_questions: ai.keyQuestions || [],
          topics: ai.topics || [], transcript: text, scores: ai.scores || {}, read_score: (ai.scores && ai.scores.overall) || 80,
        },
      });
    } catch (e) {
      // 23505 = unique_violation -> another delivery already wrote the report; safe to continue.
      if (!/23505|duplicate/i.test(String(e.message || ""))) throw e;
    }
    await sb(`meetings?id=eq.${meeting.id}`, { method: "PATCH", body: { status: "done" } });
    res.status(200).json({ ok: true });
  } catch (e) {
    // Return 5xx on transient failures so Recall retries; status stays != 'done'.
    console.error("Recall webhook error:", e && (e.stack || e.message || e));
    res.status(500).json({ ok: false, error: "processing failed" });
  }
}
