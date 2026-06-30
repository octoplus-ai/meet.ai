// Pre-translate subtitle lines for a report and cache them in reports.subtitles jsonb,
// so subtitles are instant (already there) before the viewer turns them on.
// POST { meetingId, lang, texts:[...], shareToken? }. Owner (session) or any valid share token.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";

const enc = encodeURIComponent;

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

    const sys = `You are a professional subtitle translator. Translate each string in the input JSON array into ${lang}. Keep the SAME number of items and the SAME order. Natural, concise, spoken-style. Return ONLY a JSON array of strings, no commentary.`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8000, system: sys, messages: [{ role: "user", content: JSON.stringify(texts).slice(0, 120000) }] }),
    }).then((x) => x.json());
    const out = (r && r.content && r.content[0] && r.content[0].text) || "";
    let lines;
    try { lines = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1)); } catch (e) { return res.status(502).json({ error: "translate_failed" }); }
    if (!Array.isArray(lines) || !lines.length) return res.status(502).json({ error: "bad_translation" });
    // Pad/trim to match the input length so indices stay aligned.
    while (lines.length < texts.length) lines.push("");
    lines = lines.slice(0, texts.length).map((x) => String(x == null ? "" : x));
    await sb(`reports?meeting_id=eq.${enc(meetingId)}`, { method: "PATCH", body: { subtitles: { ...subs, [lang]: lines } } });
    res.status(200).json({ lang, lines });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
