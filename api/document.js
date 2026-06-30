// Generate a polished, well-structured "smart document" of a meeting (AI-built like Gamma, but
// as a rich text doc). Returns a structured JSON the front-end renders to PDF + Word.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";

const MODEL = "claude-sonnet-4-6";
const enc = encodeURIComponent;

async function loadMeeting(req, body) {
  // Owner session
  const t = parseCookies(req).om_session;
  if (t) {
    const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
    if (s.length && body.meetingId) {
      const m = await sb(`meetings?id=eq.${enc(body.meetingId)}&user_id=eq.${s[0].user_id}&select=*,reports(*)`);
      if (m.length) return m[0];
    }
  }
  // Shared viewer/editor token
  if (body.shareToken) {
    const r = await resolveShareToken(body.shareToken);
    if (r && r.meeting) {
      const m = await sb(`meetings?id=eq.${enc(r.meeting.id)}&select=*,reports(*)`);
      if (m.length) return m[0];
    }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const m = await loadMeeting(req, body);
    if (!m) return res.status(401).json({ error: "not authorized" });

    const r = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
    const tr = r.transcript;
    const transcriptText = Array.isArray(tr) ? tr.map((x) => `${x.speaker || ""}: ${x.text || ""}`).join("\n") : (typeof tr === "string" ? tr : "");
    const participants = (Array.isArray(r.participants) ? r.participants : (Array.isArray(m.participants) ? m.participants : [])).map((p) => (typeof p === "string" ? p : (p && p.name))).filter(Boolean);
    const ai = (r.action_items || []).map((a) => `- ${a.task || ""}${a.owner ? " (" + a.owner + ")" : ""}${a.due ? " [due " + a.due + "]" : ""}`).join("\n");

    const ctx = [
      `Title: ${m.title || "Meeting"}`,
      m.start_time ? `Date: ${m.start_time}` : "",
      participants.length ? `Participants: ${participants.join(", ")}` : "",
      r.summary ? `Summary: ${r.summary}` : "",
      (r.topics && r.topics.length) ? `Topics: ${r.topics.join(", ")}` : "",
      ai ? `Action items:\n${ai}` : "",
      (r.chapters && r.chapters.length) ? `Chapters: ${r.chapters.map((c) => (typeof c === "string" ? c : c.title)).join(", ")}` : "",
      transcriptText ? `\nTranscript:\n${transcriptText.slice(0, 12000)}` : "",
    ].filter(Boolean).join("\n");

    const sys = `You are an expert meeting analyst and document designer. Read the meeting below and produce a POLISHED, executive-ready document - the kind that scores 100/100 for clarity and structure. Decide the perfect structure yourself based on what was actually discussed (it differs for a sales call vs a 1:1 vs a planning session).

Write in the SAME language the meeting was held in (detect it). Be specific and concrete - use real names, numbers, decisions and quotes from the transcript, never generic filler. Each section heading gets a fitting emoji. Keep it skimmable.

Return ONLY valid JSON (no markdown fences) with EXACTLY this shape:
{
  "title": "string - punchy document title",
  "subtitle": "string - one line describing the meeting",
  "summaryLabel": "string - heading for the summary box IN THE DOCUMENT'S LANGUAGE, e.g. 'Resumen ejecutivo' or 'Executive summary' (NOT 'TL;DR')",
  "tldr": "string - 1-2 sentence executive summary",
  "tags": ["3-5 short topic tags"],
  "sections": [
    { "emoji": "📌", "heading": "Section title", "paragraphs": ["..."], "bullets": ["..."] }
  ],
  "decisions": ["key decisions made"],
  "actionItems": [ { "task": "...", "owner": "...", "due": "..." } ],
  "nextSteps": ["concrete next steps"],
  "quote": { "text": "a memorable verbatim quote", "who": "speaker name" }
}
Rules: 4-7 sections; bullets and paragraphs may be empty arrays where not needed; omit "quote" if none stands out; never invent facts not in the transcript.`;

    const up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2200, system: sys, messages: [{ role: "user", content: ctx }] }),
    });
    if (!up.ok) { const tx = await up.text().catch(() => ""); return res.status(502).json({ error: "claude_failed", detail: tx.slice(0, 300) }); }
    const data = await up.json();
    let text = (data.content && data.content[0] && data.content[0].text) || "";
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let doc;
    try { doc = JSON.parse(text); } catch (e) { const s = text.indexOf("{"), end = text.lastIndexOf("}"); doc = JSON.parse(text.slice(s, end + 1)); }
    return res.status(200).json({ doc, meta: { title: m.title || "Meeting", date: m.start_time || m.created_at || "" } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
