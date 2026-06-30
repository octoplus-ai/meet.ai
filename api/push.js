// Deliver a meeting report to a connected destination (real, free integrations):
// Slack / Discord incoming webhooks, generic Webhooks (also HubSpot/Salesforce/
// Confluence via Zapier/Make free webhooks), and Notion via an integration token.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { deliverReport } from "./lib/deliver.js";

const APP = "https://meet-ai-three-beige.vercel.app/";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const id = s[0].user_id;
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { meetingId, target } = body;
    if (!meetingId || !target) return res.status(400).json({ error: "bad request" });

    const u = await sb(`app_users?id=eq.${id}&select=integrations`);
    const cfg = ((u[0] && u[0].integrations) || {})[target];
    if (!cfg || !(cfg.url || cfg.token)) return res.status(400).json({ error: "not_connected" });

    const rows = await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${id}&select=title,start_time,reports(summary,scores,action_items,next_steps)`);
    const m = rows[0];
    if (!m) return res.status(404).json({ error: "meeting not found" });
    const r = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
    const result = await deliverReport(target, cfg, { title: m.title || "Meeting", summary: r.summary || "", score: (r.scores && r.scores.overall) || 0, actionItems: r.action_items || [], nextSteps: r.next_steps || [], date: m.start_time, link: APP });
    if (!result.ok) return res.status(result.error === "not_connected" ? 400 : 502).json({ error: result.error || "delivery failed", status: result.status, detail: result.detail });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
