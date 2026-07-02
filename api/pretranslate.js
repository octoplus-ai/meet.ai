// Pre-translate subtitle lines for a report and cache them in reports.subtitles jsonb,
// so subtitles are instant (already there) before the viewer turns them on.
// POST { meetingId, lang, texts:[...], shareToken? }. Owner (session) or any valid share token.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";

export const config = { maxDuration: 60 }; // DeepL/Haiku translation of many subtitle lines

const enc = encodeURIComponent;

// Free/cheap translation: DeepL (free tier = 500k chars/mo) primary, Claude Haiku fallback.
const DEEPL = process.env.DEEPL_API_KEY;
const DEEPL_MAP = { English: "EN-US", "Español (Latinoamérica)": "ES", "Português (Brasil)": "PT-BR", Français: "FR", Deutsch: "DE", Italiano: "IT", "한국어": "KO", "日本語": "JA" };
async function deeplTranslate(texts, lang) {
  const target = DEEPL_MAP[lang];
  if (!DEEPL || !target) return null;
  const host = DEEPL.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  // Cost guard: only use DeepL while inside the FREE monthly allowance. Once it would exceed it
  // (and start charging the card), fall back to Haiku - which is cheaper than DeepL's paid rate.
  try {
    const reqChars = texts.reduce((a, t) => a + String(t == null ? "" : t).length, 0);
    const ur = await fetch(host + "/v2/usage", { headers: { Authorization: "DeepL-Auth-Key " + DEEPL } });
    if (ur.ok) {
      const u = await ur.json();
      const used = u.character_count || 0, limit = u.character_limit || 0;
      if (limit && used + reqChars > limit) return null; // would exceed free quota -> use Haiku instead
    }
  } catch (e) { /* if the usage check fails, proceed; a 456 quota error below still falls back */ }
  const out = [];
  try {
    for (let i = 0; i < texts.length; i += 50) { // DeepL allows up to 50 text params per request
      const chunk = texts.slice(i, i + 50).map((t) => String(t == null ? "" : t));
      const r = await fetch(host + "/v2/translate", { method: "POST", headers: { Authorization: "DeepL-Auth-Key " + DEEPL, "Content-Type": "application/json" }, body: JSON.stringify({ text: chunk, target_lang: target }) });
      if (!r.ok) return null;
      const d = await r.json();
      const tr = d && d.translations;
      if (!Array.isArray(tr) || tr.length !== chunk.length) return null;
      out.push(...tr.map((x) => String((x && x.text) || "").replace(/[—–]/g, "-")));
    }
  } catch (e) { return null; }
  return out.length === texts.length ? out : null;
}
async function haikuTranslate(texts, lang) {
  const sys = `You are a professional subtitle (closed-caption) translator. Translate each string in the input JSON array into ${lang}. Keep the SAME number of items and the SAME order. Make it sound NATURAL, like movie subtitles a person reads - concise, spoken-style, well punctuated. NEVER use em dashes or en dashes (— –); use commas or periods instead. Keep each line short. Return ONLY a JSON array of strings, no commentary.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 8000, system: sys, messages: [{ role: "user", content: JSON.stringify(texts).slice(0, 120000) }] }),
  }).then((x) => x.json());
  const outT = (r && r.content && r.content[0] && r.content[0].text) || "";
  try { const lines = JSON.parse(outT.slice(outT.indexOf("["), outT.lastIndexOf("]") + 1)); return Array.isArray(lines) && lines.length ? lines.map((x) => String(x == null ? "" : x).replace(/[—–]/g, "-")) : null; } catch (e) { return null; }
}

async function canAccess(req, meetingId, shareToken) {
  const t = parseCookies(req).om_session;
  if (t) {
    const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
    if (s.length) { const m = await sb(`meetings?id=eq.${enc(meetingId)}&user_id=eq.${s[0].user_id}&select=id`); if (m.length) return true; }
  }
  if (shareToken) {
    const r = await resolveShareToken(shareToken);
    if (r && r.meeting.id === meetingId) return true;
    const m = await sb(`meetings?share_token=eq.${enc(shareToken)}&id=eq.${enc(meetingId)}&select=id`);
    if (m.length) return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { meetingId, lang, texts } = body;
    if (!meetingId || !lang || !Array.isArray(texts) || !texts.length) return res.status(400).json({ error: "bad request" });
    if (!(await canAccess(req, meetingId, body.shareToken))) return res.status(403).json({ error: "not authorized" });

    const rep = await sb(`reports?meeting_id=eq.${enc(meetingId)}&select=subtitles`);
    const subs = (rep[0] && rep[0].subtitles && typeof rep[0].subtitles === "object") ? rep[0].subtitles : {};
    if (Array.isArray(subs[lang]) && subs[lang].length === texts.length) return res.status(200).json({ lang, lines: subs[lang], cached: true });

    // DeepL first (free/near-$0), Claude Haiku as fallback (same quality bar).
    let lines = await deeplTranslate(texts, lang);
    if (!lines) lines = await haikuTranslate(texts, lang);
    if (!Array.isArray(lines) || !lines.length) return res.status(502).json({ error: "translate_failed" });
    // Pad/trim to match the input length so indices stay aligned.
    while (lines.length < texts.length) lines.push("");
    lines = lines.slice(0, texts.length).map((x) => String(x == null ? "" : x).replace(/[—–]/g, "-"));
    await sb(`reports?meeting_id=eq.${enc(meetingId)}`, { method: "PATCH", body: { subtitles: { ...subs, [lang]: lines } } });
    res.status(200).json({ lang, lines });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
