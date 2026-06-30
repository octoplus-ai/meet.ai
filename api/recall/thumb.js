// Still image for email previews: 302 to a fresh Recall recording thumbnail if available,
// else a branded 16:9 cover. Public, gated by a valid share token (email images send no cookies).
import { sb } from "../lib/supa.js";
import { getBot, thumbnailUrl } from "../lib/recall.js";

const FALLBACK = "https://meet-ai-three-beige.vercel.app/email-cover.png";
const enc = encodeURIComponent;

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, "http://x");
    const botId = searchParams.get("botId"); const share = searchParams.get("share");
    if (!botId || !share) return res.redirect(302, FALLBACK);
    let ok = false;
    let m = await sb(`meetings?bot_id=eq.${enc(botId)}&share_token=eq.${enc(share)}&select=id`);
    if (m.length) ok = true;
    else { m = await sb(`meetings?bot_id=eq.${enc(botId)}&shares=cs.${enc(JSON.stringify([{ token: share }]))}&select=id`); if (m.length) ok = true; }
    if (!ok) return res.redirect(302, FALLBACK);
    const bot = await getBot(botId);
    const url = bot ? thumbnailUrl(bot) : null;
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.redirect(302, url || FALLBACK);
  } catch (e) { return res.redirect(302, FALLBACK); }
}
