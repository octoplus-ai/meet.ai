// Same-origin video proxy (with CORS) so the browser can capture a real frame to a canvas
// without tainting it. Forwards Range requests to the fresh S3 URL. Owner session or share token.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { getBot, videoUrl } from "../lib/recall.js";

const enc = encodeURIComponent;

export default async function handler(req, res) {
  try {
    const { searchParams } = new URL(req.url, "http://x");
    const botId = searchParams.get("botId"); const share = searchParams.get("share");
    if (!botId) { res.statusCode = 400; return res.end(); }
    let ok = false;
    const t = parseCookies(req).om_session;
    if (t) {
      const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
      if (s.length) { const m = await sb(`meetings?bot_id=eq.${enc(botId)}&user_id=eq.${s[0].user_id}&select=id`); if (m.length) ok = true; }
    }
    if (!ok && share) {
      let m = await sb(`meetings?bot_id=eq.${enc(botId)}&share_token=eq.${enc(share)}&select=id`);
      if (m.length) ok = true; else { m = await sb(`meetings?bot_id=eq.${enc(botId)}&shares=cs.${enc(JSON.stringify([{ token: share }]))}&select=id`); if (m.length) ok = true; }
    }
    if (!ok) { res.statusCode = 401; return res.end(); }

    const bot = await getBot(botId);
    const url = bot ? videoUrl(bot) : null;
    if (!url) { res.statusCode = 404; return res.end(); }
    const range = req.headers.range;
    const upstream = await fetch(url, { headers: range ? { Range: range } : {} });
    res.statusCode = upstream.status;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", "bytes");
    const ct = upstream.headers.get("content-type"); if (ct) res.setHeader("Content-Type", ct);
    const cr = upstream.headers.get("content-range"); if (cr) res.setHeader("Content-Range", cr);
    res.setHeader("Cache-Control", "private, max-age=300");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) { res.statusCode = 500; res.end(); }
}
