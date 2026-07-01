// ElevenLabs video dubbing: dub a meeting recording into another language while PRESERVING each
// participant's own voice/tone (ElevenLabs clones + acts per detected speaker). Async: start ->
// poll status -> stream the dubbed media. Persisted per language in meetings.dubs jsonb.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";
import { getBot, videoUrl } from "./lib/recall.js";

export const config = { maxDuration: 60 };
const enc = encodeURIComponent;
const EL = "https://api.elevenlabs.io/v1";
const KEY = process.env.ELEVENLABS_API_KEY;

async function ownerMeeting(req, meetingId) {
  const t = parseCookies(req).om_session;
  if (!t || !meetingId) return null;
  const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
  if (!s.length) return null;
  const m = await sb(`meetings?id=eq.${enc(meetingId)}&user_id=eq.${s[0].user_id}&select=id,bot_id,dubs,duration_min`);
  return m.length ? { meeting: m[0], ownerId: s[0].user_id } : null;
}
// For media playback: owner session OR a valid share token.
async function anyMeeting(req, meetingId, share) {
  const o = await ownerMeeting(req, meetingId);
  if (o) return o.meeting;
  if (share) { const r = await resolveShareToken(share); if (r && r.meeting && r.meeting.id === meetingId) { const m = await sb(`meetings?id=eq.${enc(meetingId)}&select=id,bot_id,dubs,duration_min`); if (m.length) return m[0]; } }
  return null;
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://x");

    // GET media: stream the dubbed file for a language.
    if (req.method === "GET") {
      if (!KEY) return res.status(501).end();
      const meetingId = url.searchParams.get("meetingId");
      const lang = url.searchParams.get("lang");
      const m = await anyMeeting(req, meetingId, url.searchParams.get("share"));
      if (!m) return res.status(401).end();
      const dub = (m.dubs && m.dubs[lang]) || null;
      if (!dub || !dub.id) return res.status(404).end();
      const up = await fetch(`${EL}/dubbing/${enc(dub.id)}/audio/${enc(lang)}`, { headers: { "xi-api-key": KEY } });
      if (!up.ok) return res.status(502).end();
      res.setHeader("Content-Type", up.headers.get("content-type") || "video/mp4");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.end(Buffer.from(await up.arrayBuffer()));
      return;
    }

    if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
    if (!KEY) return res.status(501).json({ error: "no_elevenlabs_key" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const a = await ownerMeeting(req, body.meetingId);
    if (!a) return res.status(401).json({ error: "not authorized" });
    const m = a.meeting;
    const lang = String(body.lang || "").slice(0, 8);
    if (!lang) return res.status(400).json({ error: "no lang" });
    const dubs = (m.dubs && typeof m.dubs === "object") ? m.dubs : {};

    if (body.action === "status") {
      const dub = dubs[lang];
      if (!dub || !dub.id) return res.status(200).json({ status: "none" });
      const r = await fetch(`${EL}/dubbing/${enc(dub.id)}`, { headers: { "xi-api-key": KEY } });
      const d = await r.json().catch(() => ({}));
      const status = d.status || dub.status || "dubbing"; // "dubbing" | "dubbed" | "failed"
      dubs[lang] = { ...dub, status };
      await sb(`meetings?id=eq.${enc(m.id)}`, { method: "PATCH", body: { dubs } });
      return res.status(200).json({ status, ready: status === "dubbed" });
    }

    // action: start
    const bot = m.bot_id ? await getBot(m.bot_id) : null;
    const src = bot ? videoUrl(bot) : null;
    if (!src) return res.status(400).json({ error: "no_recording", detail: "This meeting has no downloadable recording to dub." });

    const form = new FormData();
    form.append("source_url", src);
    form.append("target_lang", lang);
    form.append("num_speakers", "0"); // auto-detect speakers -> one cloned voice per participant
    form.append("mode", "automatic");
    const r = await fetch(`${EL}/dubbing`, { method: "POST", headers: { "xi-api-key": KEY }, body: form });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.dubbing_id) return res.status(502).json({ error: "dub_failed", detail: (d && (d.detail && d.detail.message || d.message)) || JSON.stringify(d).slice(0, 200) });
    dubs[lang] = { id: d.dubbing_id, status: "dubbing", startedAt: new Date().toISOString() };
    await sb(`meetings?id=eq.${enc(m.id)}`, { method: "PATCH", body: { dubs } });
    return res.status(200).json({ id: d.dubbing_id, status: "dubbing" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
