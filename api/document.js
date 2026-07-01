// Generate a polished, well-structured "smart document" of a meeting (AI-built like Gamma, but
// as a rich text doc). Returns a structured JSON the front-end renders to PDF + Word.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";
import { artifactKey, getArtifact, saveArtifact, consumeQuota } from "./lib/limits.js";

const MODEL = "claude-sonnet-4-6";
const enc = encodeURIComponent;

async function sessionUser(req) {
  const t = parseCookies(req).om_session;
  if (!t) return null;
  const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
}

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

// Returns an array of owned meetings (1 for the single path, many for multi-select).
async function loadMeetings(req, body) {
  if (Array.isArray(body.meetingIds) && body.meetingIds.length) {
    const t = parseCookies(req).om_session;
    if (!t) return [];
    const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
    if (!s.length) return [];
    const ids = body.meetingIds.filter((x) => typeof x === "string").slice(0, 12).map(enc).join(",");
    if (!ids) return [];
    return (await sb(`meetings?id=in.(${ids})&user_id=eq.${s[0].user_id}&select=*,reports(*)`)) || [];
  }
  const one = await loadMeeting(req, body);
  return one ? [one] : [];
}

function meetingSection(m, per) {
  const r = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
  const tr = r.transcript;
  const transcriptText = Array.isArray(tr) ? tr.map((x) => `${x.speaker || ""}: ${x.text || ""}`).join("\n") : (typeof tr === "string" ? tr : "");
  const participants = (Array.isArray(r.participants) ? r.participants : (Array.isArray(m.participants) ? m.participants : [])).map((p) => (typeof p === "string" ? p : (p && p.name))).filter(Boolean);
  const ai = (r.action_items || []).map((a) => `- ${a.task || ""}${a.owner ? " (" + a.owner + ")" : ""}${a.due ? " [due " + a.due + "]" : ""}`).join("\n");
  return [
    `## Meeting: ${m.title || "Meeting"}`,
    m.start_time ? `Date: ${m.start_time}` : "",
    participants.length ? `Participants: ${participants.join(", ")}` : "",
    r.summary ? `Summary: ${r.summary}` : "",
    (r.topics && r.topics.length) ? `Topics: ${r.topics.join(", ")}` : "",
    ai ? `Action items:\n${ai}` : "",
    transcriptText ? `Transcript excerpt:\n${transcriptText.slice(0, per)}` : "",
  ].filter(Boolean).join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const mtgs = await loadMeetings(req, body);
    if (!mtgs.length) return res.status(401).json({ error: "not authorized" });
    const multi = mtgs.length > 1;
    const m = mtgs[0];

    // Saved-artifact cache + hidden monthly cap (owner session only).
    const ownerId = await sessionUser(req);
    const akey = artifactKey(mtgs.map((x) => x.id));
    if (ownerId && !body.regenerate) {
      const a = await getArtifact(ownerId, "doc", akey);
      if (a) return res.status(200).json({ doc: a.payload, meta: a.meta || {}, cached: true });
    }
    if (ownerId) {
      const q = await consumeQuota(ownerId, "doc");
      if (!q.ok) return res.status(429).json({ error: "limit", kind: "doc" });
    }

    const per = Math.max(1500, Math.floor(8000 / mtgs.length));
    const ctx = mtgs.map((x) => meetingSection(x, per)).join("\n\n---\n\n");

    const sys = `You are an expert meeting analyst and document designer. ${multi ? `You are given ${mtgs.length} meetings. MERGE them into ONE unified, executive-ready document - do NOT create a separate section per meeting and do NOT summarize them one by one. Instead, combine and cross-reference everything: synthesize the shared themes, consolidate decisions and action items ACROSS the whole set, reconcile what evolved between meetings, and tell ONE coherent story as if it were a single body of work.` : "Read the meeting below and produce a POLISHED, executive-ready document"} - the kind that scores 100/100 for clarity and structure. Decide the perfect structure yourself based on what was actually discussed (it differs for a sales call vs a 1:1 vs a planning session).

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
Rules: 4-6 sections; BE CONCISE - short paragraphs (1-2 sentences) and prefer bullets; bullets/paragraphs may be empty arrays where not needed; omit "quote" if none stands out; never invent facts not in the transcript.`;

    const up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1800, system: sys, messages: [{ role: "user", content: ctx }] }),
    });
    if (!up.ok) { const tx = await up.text().catch(() => ""); return res.status(502).json({ error: "claude_failed", detail: tx.slice(0, 300) }); }
    const data = await up.json();
    let text = (data.content && data.content[0] && data.content[0].text) || "";
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let doc;
    try { doc = JSON.parse(text); } catch (e) { const s = text.indexOf("{"), end = text.lastIndexOf("}"); doc = JSON.parse(text.slice(s, end + 1)); }
    const meta = { title: multi ? `${mtgs.length} meetings` : (m.title || "Meeting"), date: m.start_time || m.created_at || "" };
    if (ownerId) await saveArtifact(ownerId, "doc", akey, doc, meta);
    return res.status(200).json({ doc, meta, cached: false });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
