// Generate a Gamma-style slide deck (structured JSON) from a meeting. Mirrors api/document.js:
// same auth (owner session OR shareToken), same Anthropic call + JSON repair. Adds optional
// attached images (Claude vision) and attached text files to inform/improve the deck.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";

const MODEL = "claude-sonnet-4-6";
const enc = encodeURIComponent;
const VALID_LAYOUTS = ["cover", "agenda", "bullets", "twoColumn", "bigStat", "quote", "imageText", "timeline", "closing"];

async function loadMeeting(req, body) {
  const t = parseCookies(req).om_session;
  if (t) {
    const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
    if (s.length && body.meetingId) {
      const m = await sb(`meetings?id=eq.${enc(body.meetingId)}&user_id=eq.${s[0].user_id}&select=*,reports(*)`);
      if (m.length) return m[0];
    }
  }
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

    const N = Math.max(4, Math.min(16, parseInt(body.slideCount, 10) || 8));
    const themeId = body.themeId || "sleek-dark";

    const r = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
    const tr = r.transcript;
    const transcriptText = Array.isArray(tr) ? tr.map((x) => `${x.speaker || ""}: ${x.text || ""}`).join("\n") : (typeof tr === "string" ? tr : "");
    const participants = (Array.isArray(r.participants) ? r.participants : (Array.isArray(m.participants) ? m.participants : [])).map((p) => (typeof p === "string" ? p : (p && p.name))).filter(Boolean);
    const ai = (r.action_items || []).map((a) => `- ${a.task || ""}${a.owner ? " (" + a.owner + ")" : ""}${a.due ? " [due " + a.due + "]" : ""}`).join("\n");

    const ctxText = [
      `Title: ${m.title || "Meeting"}`,
      m.start_time ? `Date: ${m.start_time}` : "",
      participants.length ? `Participants: ${participants.join(", ")}` : "",
      r.summary ? `Summary: ${r.summary}` : "",
      (r.topics && r.topics.length) ? `Topics: ${r.topics.join(", ")}` : "",
      ai ? `Action items:\n${ai}` : "",
      transcriptText ? `\nTranscript:\n${transcriptText.slice(0, 9000)}` : "(no transcript available)",
    ].filter(Boolean).join("\n");

    const fileText = (Array.isArray(body.files) ? body.files : []).slice(0, 5)
      .map((f) => `\n--- Attached file: ${String(f.name || "file")} ---\n${String(f.text || "").slice(0, 4000)}`).join("");

    const images = (Array.isArray(body.images) ? body.images : []).slice(0, 4);
    const imageBlocks = images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mediaType || "image/jpeg", data: String(im.data || "") } }));
    const imageManifest = images.length
      ? `\n\nThe user attached ${images.length} image(s), referenceable as ${images.map((_, i) => `img_${i}`).join(", ")}. Use them on "imageText" slides via "imageRef" where genuinely relevant; otherwise omit imageRef.`
      : "";

    const sys = `You are an expert presentation designer. Turn the meeting below into a tight, modern slide deck like Gamma.

HARD RULES
- Return EXACTLY ${N} slides. The first slide MUST be "cover"; the last MUST be "closing".
- ONE idea per slide. Be concise: titles <= 9 words; bullets <= 12 words; max 5 bullets per slide. Edit text DOWN, never cram.
- Make every slide TITLE a takeaway sentence, not a topic label ("Revenue doubled in Q3", not "Revenue").
- Choose the layout that fits the content: bigStat for a single KPI; quote for a verbatim quote; twoColumn for comparisons; timeline for sequences/roadmaps; agenda near the start; bullets only for 3-5 parallel points; imageText when an attached image is relevant.
- NEVER invent statistics, numbers, quotes, names, dates or sources. Use ONLY facts in the meeting/attachments. A bigStat number must appear verbatim in the source; a quote must be verbatim from the transcript.
- Write ALL text in the SAME language the meeting was held in; set "lang" to its ISO code.
- The deck must be designed for theme "${themeId}" (clean, high-contrast, minimal).${imageManifest}

Return ONLY valid JSON (no markdown fences), EXACTLY:
{"lang":"xx","title":"...","subtitle":"...","themeId":"${themeId}","slides":[
  {"layout":"cover","title":"...","subtitle":"...","eyebrow":"..."},
  {"layout":"agenda","title":"...","items":["..."]},
  {"layout":"bullets","title":"...","bullets":["..."]},
  {"layout":"twoColumn","title":"...","left":{"heading":"...","bullets":["..."]},"right":{"heading":"...","bullets":["..."]}},
  {"layout":"bigStat","title":"...","stat":"92%","statLabel":"...","caption":"..."},
  {"layout":"quote","title":"...","quote":"...","attribution":"Name, role"},
  {"layout":"imageText","title":"...","body":"...","bullets":["..."],"imageRef":"img_0","imageSide":"right"},
  {"layout":"timeline","title":"...","events":[{"when":"...","what":"..."}]},
  {"layout":"closing","title":"...","headline":"...","bullets":["..."],"contact":"..."}
]}
Allowed layouts: ${VALID_LAYOUTS.join(", ")}. You may add an optional "note" (speaker note) per slide; no other fields.`;

    const userContent = [{ type: "text", text: ctxText + fileText }, ...imageBlocks];

    const up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: sys, messages: [{ role: "user", content: userContent }] }),
    });
    if (!up.ok) { const tx = await up.text().catch(() => ""); return res.status(502).json({ error: "claude_failed", detail: tx.slice(0, 300) }); }
    const data = await up.json();
    let text = (data.content && data.content[0] && data.content[0].text) || "";
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let deck;
    try { deck = JSON.parse(text); } catch (e) { const s = text.indexOf("{"), end = text.lastIndexOf("}"); deck = JSON.parse(text.slice(s, end + 1)); }
    deck.themeId = themeId;
    return res.status(200).json({ deck, themeId, meta: { title: m.title || "Meeting", date: m.start_time || m.created_at || "" } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
