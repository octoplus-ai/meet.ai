// Generate a polished, well-structured "smart document" of a meeting (AI-built like Gamma, but
// as a rich text doc). Returns a structured JSON the front-end renders to PDF + Word.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";
import { artifactKey, getArtifact, saveArtifact, consumeQuota } from "./lib/limits.js";
import { extractJson } from "./lib/aijson.js";
import { noDashes } from "./lib/nodash.js";
import { CLASSIFY_INTRO, DOC_GUIDANCE } from "./lib/meetingType.js";

// The Claude call that builds the doc can run ~15-25s; without this it would hit the
// platform's short default timeout and the generation would fail mid-flight.
export const config = { maxDuration: 60 };

const MODEL = "claude-sonnet-4-6";
const enc = encodeURIComponent;

async function sessionUser(req) {
  const t = parseCookies(req).om_session;
  if (!t) return null;
  const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
}

async function loadMeeting(req, body, ownerId) {
  // Owner session (ownerId already resolved once by the caller - no second session lookup)
  if (ownerId && body.meetingId) {
    const m = await sb(`meetings?id=eq.${enc(body.meetingId)}&user_id=eq.${ownerId}&select=*,reports(*)`);
    if (m.length) return m[0];
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
async function loadMeetings(req, body, ownerId) {
  if (Array.isArray(body.meetingIds) && body.meetingIds.length) {
    if (!ownerId) return [];
    const ids = body.meetingIds.filter((x) => typeof x === "string").slice(0, 12).map(enc).join(",");
    if (!ids) return [];
    return (await sb(`meetings?id=in.(${ids})&user_id=eq.${ownerId}&select=*,reports(*)`)) || [];
  }
  const one = await loadMeeting(req, body, ownerId);
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
    // Resolve the session -> owner id ONCE and reuse it for both the meeting load and the
    // artifact-cache/quota checks below (previously this session row was queried twice, serially).
    const ownerId = await sessionUser(req);
    const mtgs = await loadMeetings(req, body, ownerId);
    if (!mtgs.length) return res.status(401).json({ error: "not authorized" });
    const multi = mtgs.length > 1;
    const m = mtgs[0];

    // Saved-artifact cache + hidden monthly cap (owner session only).
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

    const sys = `You are a world-class chief-of-staff and knowledge designer. Your output is NOT a recap - it is "the best version of this meeting": a polished, reusable working document a professional can open before the NEXT similar meeting and be fully prepared, and can also present from directly. Think of it as the meeting distilled, cleaned up, and UPGRADED.

${multi ? `You are given ${mtgs.length} meetings. MERGE them into ONE unified document - do NOT create a section per meeting or summarize them one by one. Synthesize the shared themes, consolidate decisions and action items ACROSS the whole set, reconcile what evolved between them, and tell ONE coherent story as a single body of work.` : "Read the meeting below and build the document."}

WHAT MAKES IT "AMAZING" (do all of this):
- DISTILL AND IMPROVE, don't transcribe. Turn rambling discussion into crisp, well-worded points. Fix filler, tangents and repetition. Keep ONLY what is genuinely important, decision-relevant, or reusable next time. Ruthlessly cut noise.
- Make it REUSABLE. Where the content supports it, surface the durable value: the key topics explained clearly, the strongest arguments/talking points, the questions that mattered (and the answers), objections raised and how they were handled, useful data/numbers, and any framework or approach worth repeating. This is source material for future similar meetings.
- Be CONCRETE and faithful. Use real names, numbers, decisions and short verbatim quotes from the transcript. NEVER invent facts, figures, owners or dates that are not in the source. If the meeting was thin, produce a shorter honest document rather than padding.
- Be PRESENTATION-READY: confident, well-structured, skimmable. Each section heading gets a fitting emoji.
- Decide the perfect structure YOURSELF based on the meeting TYPE you classify (see below) and what was actually discussed. Prefer sections that will still be useful weeks later.
- Write in the SAME language the meeting was held in (detect it).

${CLASSIFY_INTRO}

${DOC_GUIDANCE}

Return ONLY valid JSON (no markdown fences) with EXACTLY this shape:
{
  "title": "string - punchy, specific document title (not just the meeting name)",
  "subtitle": "string - one line on what this doc gives the reader",
  "meetingType": "one of: sales | informative | training | decision | other - your classification of this meeting",
  "meetingTypeLabel": "short 1-3 word label for that type IN THE DOCUMENT'S LANGUAGE (e.g. 'Reunion de ventas', 'Sales call', 'Capacitacion', 'Estrategia')",
  "summaryLabel": "string - heading for the summary box IN THE DOCUMENT'S LANGUAGE, e.g. 'Resumen ejecutivo' or 'Executive summary' (NOT 'TL;DR')",
  "tldr": "string - 2-3 sentence executive summary a busy person could read alone and be caught up",
  "tags": ["3-5 short topic tags"],
  "sections": [
    { "emoji": "📌", "heading": "Section title", "paragraphs": ["..."], "bullets": ["..."] }
  ],
  "decisions": ["key decisions made - verbatim intent, no invention"],
  "actionItems": [ { "task": "...", "owner": "...", "due": "..." } ],
  "nextSteps": ["concrete next steps"],
  "quote": { "text": "a memorable verbatim quote", "who": "speaker name" }
}
Rules: 4-7 sections, each earning its place. Prefer tight bullets over long paragraphs; paragraphs are 1-2 sentences max. bullets/paragraphs may be empty arrays where not needed. Omit "quote" if nothing stands out. Only include owners/dues that were actually stated.
NEVER use em dashes or en dashes (the "—" or "–" characters) anywhere in any text value - use a normal hyphen "-", a comma, or rewrite. Em dashes make a document look AI-written, which we never want.`;

    const up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      // 8000 (was 3000): a rich meeting's JSON doc was being truncated mid-object at 3000, which
      // then failed to parse and returned a 500. The robust extractJson below is the safety net;
      // the higher ceiling stops truncation from happening in the first place.
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: sys, messages: [{ role: "user", content: ctx }] }),
    });
    if (!up.ok) { const tx = await up.text().catch(() => ""); return res.status(502).json({ error: "claude_failed", detail: tx.slice(0, 300) }); }
    const data = await up.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";
    // Truncation-proof parse: never throw a 500 on imperfect model output. A 502 tells the client
    // to simply retry (it already shows a friendly toast) instead of surfacing a crash.
    // Strip any em/en dashes the model produced anyway (belt-and-suspenders on top of the prompt rule).
    const doc = noDashes(extractJson(text));
    if (!doc || typeof doc !== "object") return res.status(502).json({ error: "doc_parse_failed", stop: data.stop_reason || "" });
    const meta = { title: multi ? `${mtgs.length} meetings` : (m.title || "Meeting"), date: m.start_time || m.created_at || "", meetingType: doc.meetingType || "", meetingTypeLabel: doc.meetingTypeLabel || "" };
    if (ownerId) await saveArtifact(ownerId, "doc", akey, doc, meta);
    return res.status(200).json({ doc, meta, cached: false });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
