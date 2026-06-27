// Streams a fresh, signed Recall recording URL. The S3 URLs expire (~1h), so the
// app's <video> points here (?botId=...&kind=video) and we 302 to a fresh URL on each load.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { getBot, videoUrl } from "../lib/recall.js";

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, "http://x");
    const botId = searchParams.get("botId");
    if (!botId) return res.status(400).json({ error: "botId required" });

    // Auth: caller's session must own a meeting with this bot.
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const m = await sb(`meetings?bot_id=eq.${encodeURIComponent(botId)}&user_id=eq.${s[0].user_id}&select=id`);
    if (!m.length) return res.status(404).json({ error: "not found" });

    const bot = await getBot(botId);
    const url = bot ? videoUrl(bot) : null;
    if (!url) return res.status(404).json({ error: "no recording yet" });
    res.setHeader("Cache-Control", "private, max-age=600");
    res.redirect(302, url);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
