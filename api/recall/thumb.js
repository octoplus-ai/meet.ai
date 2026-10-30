// Still image for email previews: 302 to a fresh Recall recording thumbnail if available,
// else a branded 16:9 cover. Public, gated by a valid share token (email images send no cookies).
import { authorizedShare } from "../lib/share.js";
import { getBot, thumbnailUrl } from "../lib/recall.js";

const FALLBACK = "https://meet-ai-three-beige.vercel.app/email-cover.png";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const { searchParams } = new URL(req.url, "http://x");
    const botId = searchParams.get("botId"); const share = searchParams.get("share");
    if (!botId || !share) return res.redirect(302, FALLBACK);
    const ok = !!(await authorizedShare(req, share, { botId }));
    if (!ok) return res.redirect(302, FALLBACK);
    const bot = await getBot(botId);
    const url = bot ? thumbnailUrl(bot) : null;
    return res.redirect(302, url || FALLBACK);
  } catch (e) { return res.redirect(302, FALLBACK); }
}
