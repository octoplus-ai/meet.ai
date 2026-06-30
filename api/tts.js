// Best-quality text-to-speech for the in-video "Audio" (dub) feature. Speaks a translated
// subtitle line in any language. Uses OpenAI tts-1-hd, caches each clip in Supabase storage
// (bucket "tts") keyed by hash(lang|voice|text) so repeats are instant + free. If no
// OPENAI_API_KEY is set, returns 501 and the player falls back to the browser's free voice.
import crypto from "node:crypto";
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

const enc = encodeURIComponent;
const SUPA = process.env.SUPABASE_URL || "https://xewahhatxhmfjlujitfa.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OAI = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_TTS_MODEL || "tts-1"; // tts-1 = cheaper; tts-1-hd = higher quality
// A palette of distinct OpenAI voices; each speaker is mapped to a STABLE one so the dub keeps a
// consistent, recognizable voice per person (closest we can get to matching tone without cloning).
const VOICES = ["onyx", "nova", "echo", "shimmer", "fable", "alloy"];
const voiceFor = (speaker) => {
  const s = String(speaker || "").trim();
  if (!s) return process.env.OPENAI_TTS_VOICE || "nova";
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return VOICES[h % VOICES.length];
};

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    if (!OAI) return res.status(501).json({ error: "no_tts_key" }); // -> client uses free browser voice

    // Logged-in users only (the dub costs OpenAI credits). Shared viewers fall back to the free voice.
    const t = parseCookies(req).om_session;
    const s = t ? await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`) : [];
    if (!s.length) return res.status(401).json({ error: "not authenticated" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 800);
    const lang = String(body.lang || "").slice(0, 40);
    const voice = voiceFor(body.speaker);
    if (!text) return res.status(400).json({ error: "no text" });

    const hash = crypto.createHash("sha1").update(MODEL + "|" + lang + "|" + voice + "|" + text).digest("hex");
    const publicUrl = `${SUPA}/storage/v1/object/public/tts/${hash}.mp3`;

    // Cache hit -> serve stored clip.
    const cached = await fetch(publicUrl);
    if (cached.ok) {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.end(Buffer.from(await cached.arrayBuffer()));
    }

    // Generate with OpenAI (tts-1 by default = cheaper), one voice per speaker.
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${OAI}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, voice, input: text, response_format: "mp3" }),
    });
    if (!r.ok) { const tx = await r.text().catch(() => ""); return res.status(502).json({ error: "tts_failed", detail: tx.slice(0, 200) }); }
    const audio = Buffer.from(await r.arrayBuffer());

    // Cache for next time (best-effort, don't block the response).
    fetch(`${SUPA}/storage/v1/object/tts/${hash}.mp3`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "audio/mpeg", "x-upsert": "true", "Cache-Control": "max-age=31536000" },
      body: audio,
    }).catch(() => {});

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(audio);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
