// Store a real meeting frame (captured client-side from the video) as the report's cover, so
// share/recap emails can show the actual recording still instead of a generic gradient.
// POST { botId, image: dataURL }. Owner session only. Idempotent (skips if a cover exists).
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";

const enc = encodeURIComponent;
const SUPA = process.env.SUPABASE_URL || "https://xewahhatxhmfjlujitfa.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const botId = String(body.botId || "");
    if (!botId) return res.status(400).json({ error: "no botId" });

    const t = parseCookies(req).om_session;
    const s = t ? await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`) : [];
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const m = await sb(`meetings?bot_id=eq.${enc(botId)}&user_id=eq.${s[0].user_id}&select=id,cover_url`);
    if (!m.length) return res.status(404).json({ error: "not found" });
    if (m[0].cover_url) return res.status(200).json({ ok: true, url: m[0].cover_url, skipped: true });

    const b64 = String(body.image || "").replace(/^data:image\/\w+;base64,/, "");
    const bytes = Buffer.from(b64, "base64");
    if (!bytes.length || bytes.length > 800000) return res.status(400).json({ error: "bad image" });

    const path = `${botId}.jpg`;
    const up = await fetch(`${SUPA}/storage/v1/object/covers/${enc(path)}`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "image/jpeg", "x-upsert": "true", "Cache-Control": "max-age=31536000" },
      body: bytes,
    });
    if (!up.ok) { const tx = await up.text().catch(() => ""); return res.status(502).json({ error: "upload failed", detail: tx.slice(0, 200) }); }
    const url = `${SUPA}/storage/v1/object/public/covers/${enc(path)}`;
    await sb(`meetings?id=eq.${m[0].id}`, { method: "PATCH", body: { cover_url: url } });
    res.status(200).json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
