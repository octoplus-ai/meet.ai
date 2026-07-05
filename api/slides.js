// Generate a Gamma-style slide deck (structured JSON) from a meeting. Mirrors api/document.js:
// same auth (owner session OR shareToken), same Anthropic call + JSON repair. Adds optional
// attached images (Claude vision) and attached text files to inform/improve the deck.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";
import { artifactKey, getArtifact, saveArtifact, consumeQuota } from "./lib/limits.js";
import { extractJson } from "./lib/aijson.js";
import { noDashes } from "./lib/nodash.js";
import { CLASSIFY_INTRO, DECK_GUIDANCE } from "./lib/meetingType.js";

export const config = { maxDuration: 60 };

async function sessionUser(req) {
  const t = parseCookies(req).om_session;
  if (!t) return null;
  const s = await sb(`sessions?token=eq.${encodeURIComponent(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
} // AI image generation needs headroom

const MODEL = "claude-sonnet-4-6";
const enc = encodeURIComponent;
const VALID_LAYOUTS = ["cover", "agenda", "bullets", "twoColumn", "bigStat", "quote", "imageText", "timeline", "closing"];

// Generate one AI image as a data URL. Tries gpt-image-1, then falls back to dall-e-3 so images
// NEVER silently break (gpt-image-1 requires an org-verified key; dall-e-3 does not). null only if both fail.
async function genImageWith(key, model, prompt) {
  // dall-e-3 is the FALLBACK and only ever a full-bleed background behind a dark scrim, so "hd"
  // detail is invisible under the scrim - "standard" looks identical, generates faster and costs ~half.
  const body = model === "gpt-image-1"
    ? { model, prompt, size: "1536x1024", quality: "medium", n: 1 }
    : { model: "dall-e-3", prompt, size: "1792x1024", quality: "standard", response_format: "b64_json", n: 1 };
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const d = await r.json();
  const b64 = d && d.data && d.data[0] && d.data[0].b64_json;
  if (!b64) throw new Error(`${model}: empty response`);
  return "data:image/png;base64," + b64;
}

// If the deployment's OpenAI key is NOT org-verified, gpt-image-1 fails on EVERY image and each one
// pays a full doomed round-trip before falling back to dall-e-3. Latch the failure once per warm
// lambda so subsequent images (this deck AND later requests) skip straight to dall-e-3. Set back to
// false is never needed - a cold start clears it, which re-probes after a possible key upgrade.
let gptImageBroken = false;
async function genImage(key, prompt) {
  const p = String(prompt || "").slice(0, 900);
  if (!p) return null;
  const models = gptImageBroken ? ["dall-e-3"] : ["gpt-image-1", "dall-e-3"];
  for (const model of models) {
    try { return await genImageWith(key, model, p); }
    catch (e) {
      if (model === "gpt-image-1") gptImageBroken = true; // don't repay this doomed call per-image
      console.warn("[slides] image gen failed on", model + ":", e.message);
    }
  }
  return null;
}

async function loadMeeting(req, body, ownerId) {
  if (ownerId && body.meetingId) {
    const m = await sb(`meetings?id=eq.${enc(body.meetingId)}&user_id=eq.${ownerId}&select=*,reports(*)`);
    if (m.length) return m[0];
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
    // Resolve session -> owner id ONCE and reuse it (was queried twice, serially).
    const ownerId = await sessionUser(req);
    const mtgs = await loadMeetings(req, body, ownerId);
    if (!mtgs.length) return res.status(401).json({ error: "not authorized" });
    const multi = mtgs.length > 1;
    const m = mtgs[0];

    const N = Math.max(4, Math.min(16, parseInt(body.slideCount, 10) || 8));
    const themeId = body.themeId || "sleek-dark";
    const acct = ownerId || (m && m.user_id) || null; // accountable owner (charged even on the share path)
    const withImages = !!body.withImages && !!process.env.OPENAI_API_KEY && !!ownerId; // image gen: owner only
    const kind = withImages ? "deck_img" : "deck";

    // Saved-artifact cache + hidden monthly cap (owner session only).
    const akey = artifactKey(mtgs.map((x) => x.id));
    if (acct && !(ownerId && body.regenerate)) {
      const a = await getArtifact(acct, kind, akey);
      if (a && a.payload && a.payload.deck) return res.status(200).json({ deck: a.payload.deck, genImages: a.payload.genImages || [], themeId: (a.meta && a.meta.themeId) || themeId, meta: a.meta || {}, cached: true });
    }
    if (acct) {
      const q = await consumeQuota(acct, kind);
      if (!q.ok) return res.status(429).json({ error: "limit", kind });
    }

    const per = Math.max(1500, Math.floor(9000 / mtgs.length));
    const ctxText = mtgs.map((x) => meetingSection(x, per)).join("\n\n---\n\n") || "(no transcript available)";

    const fileText = (Array.isArray(body.files) ? body.files : []).slice(0, 5)
      .map((f) => `\n--- Attached file: ${String(f.name || "file")} ---\n${String(f.text || "").slice(0, 4000)}`).join("");

    const images = (Array.isArray(body.images) ? body.images : []).slice(0, 4);
    const imageBlocks = images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.mediaType || "image/jpeg", data: String(im.data || "") } }));
    const imageManifest = images.length
      ? `\n\nThe user attached ${images.length} image(s), referenceable as ${images.map((_, i) => `img_${i}`).join(", ")}. Use them on "imageText" slides via "imageRef" where genuinely relevant; otherwise omit imageRef.`
      : "";

    const sys = `You are an expert presentation designer. Turn the ${multi ? `${mtgs.length} meetings below into ONE cohesive` : "meeting below into a"} tight, modern slide deck like Gamma${multi ? ". MERGE the meetings into a single unified narrative - do NOT dedicate separate slides to each meeting; synthesize the shared themes, consolidate decisions/action items across all of them, and tell one combined story" : ""}.

HARD RULES
- Return EXACTLY ${N} slides. The first slide MUST be "cover"; the last MUST be "closing".
- ONE idea per slide. Be concise: titles <= 9 words; bullets <= 12 words; max 5 bullets per slide. Edit text DOWN, never cram.
- Make every slide TITLE a takeaway sentence, not a topic label ("Revenue doubled in Q3", not "Revenue").
- Choose the layout that fits the content: bigStat for a single KPI; quote for a verbatim quote; twoColumn for comparisons; timeline for sequences/roadmaps; agenda near the start; bullets only for 3-5 parallel points; imageText when an attached image is relevant.
- NEVER invent statistics, numbers, quotes, names, dates or sources. Use ONLY facts in the meeting/attachments. A bigStat number must appear verbatim in the source; a quote must be verbatim from the transcript.
- Write ALL text in the SAME language the meeting was held in.
- The deck must be designed for theme "${themeId}" (clean, high-contrast, minimal).${imageManifest}${withImages ? `\n- IMAGES: add an "imagePrompt" field to the COVER, the CLOSING, and 2-3 of the most visual content slides. imagePrompt = a vivid, literal ENGLISH description of a professional, cinematic photo/illustration with NO text, letters, words, logos, charts or UI in the image, relevant to that slide's topic. These become full-bleed backgrounds behind a dark scrim, so favor images with clear negative space and a focal subject off-center. Keep ONE consistent art direction across every image (same medium, palette, and lighting - e.g. "cinematic wide-angle photo, soft natural light, muted palette with a violet accent") so the deck looks designed by one hand. Do NOT add imagePrompt to dense data/bullet slides that need a clean background. At most 5 imagePrompts total.` : ""}

${CLASSIFY_INTRO}

${DECK_GUIDANCE}

Return ONLY valid JSON (no markdown fences), EXACTLY:
{"title":"...","meetingType":"one of: sales | informative | training | decision | other - your classification","meetingTypeLabel":"short 1-3 word label for that type IN THE DECK'S LANGUAGE","slides":[
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
Allowed layouts: ${VALID_LAYOUTS.join(", ")}. Add no other fields.
NEVER use em dashes or en dashes (the "—" or "–" characters) in any slide text - use a normal hyphen "-" or rewrite. Em dashes look AI-generated.`;

    const userContent = [{ type: "text", text: ctxText + fileText }, ...imageBlocks];

    const up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      // 8000 (was 4000): stop a rich deck's JSON from being truncated mid-slide (which parsed to a
      // 500). extractJson is the truncation-proof safety net.
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: sys, messages: [{ role: "user", content: userContent }] }),
    });
    if (!up.ok) { const tx = await up.text().catch(() => ""); return res.status(502).json({ error: "claude_failed", detail: tx.slice(0, 300) }); }
    const data = await up.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";
    // Strip any em/en dashes the model produced anyway (belt-and-suspenders on top of the prompt rule).
    const deck = noDashes(extractJson(text));
    if (!deck || typeof deck !== "object" || !Array.isArray(deck.slides)) return res.status(502).json({ error: "deck_parse_failed", stop: data.stop_reason || "" });
    deck.themeId = themeId;

    // Generate AI background images for slides Claude flagged with imagePrompt (parallel, capped).
    let genImages = [];
    if (withImages && Array.isArray(deck.slides)) {
      const picks = deck.slides.filter((s) => s && typeof s.imagePrompt === "string" && s.imagePrompt.trim()).slice(0, 5);
      const results = await Promise.all(picks.map((s) => genImage(process.env.OPENAI_API_KEY, s.imagePrompt)));
      const userCount = images.length;
      picks.forEach((s, i) => { if (results[i]) { genImages.push(results[i]); s.bgImage = userCount + genImages.length - 1; } });
    }
    const meta = { title: multi ? `${mtgs.length} meetings` : (m.title || "Meeting"), date: m.start_time || m.created_at || "", themeId, slideCount: N, withImages, meetingType: deck.meetingType || "", meetingTypeLabel: deck.meetingTypeLabel || "" };
    if (acct) await saveArtifact(acct, kind, akey, { deck, genImages }, meta);
    return res.status(200).json({ deck, genImages, themeId, meta, cached: false });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
