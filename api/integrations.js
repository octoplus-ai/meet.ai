// Store per-user integration configs (webhook URLs / Notion token) for "Push to…".
// Free + no paid service: Slack/Discord/Zapier incoming webhooks + Notion API token.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

async function userId(req) {
  const t = parseCookies(req).om_session;
  const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const id = await userId(req);
    if (!id) return res.status(401).json({ error: "not authenticated" });

    if (req.method === "GET") {
      const u = await sb(`app_users?id=eq.${id}&select=integrations`);
      const ints = (u[0] && u[0].integrations) || {};
      const connected = {};
      for (const k in ints) connected[k] = !!(ints[k] && (ints[k].url || ints[k].token));
      return res.status(200).json({ connected });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const { target, config } = body;
      if (!target) return res.status(400).json({ error: "no target" });
      const u = await sb(`app_users?id=eq.${id}&select=integrations`);
      const ints = (u[0] && u[0].integrations) || {};
      if (config === null) delete ints[target]; else ints[target] = config;
      await sb(`app_users?id=eq.${id}`, { method: "PATCH", body: { integrations: ints } });
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
