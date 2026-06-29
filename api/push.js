// Deliver a meeting report to a connected destination (real, free integrations):
// Slack / Discord incoming webhooks, generic Webhooks (also HubSpot/Salesforce/
// Confluence via Zapier/Make free webhooks), and Notion via an integration token.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

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
    const rep = Array.isArray(m.reports) ? m.reports[0] : m.reports;
    const r = rep || {};
    const title = m.title || "Meeting";
    const summary = r.summary || "";
    const score = (r.scores && r.scores.overall) || 0;
    const actions = (r.action_items || []).map((a) => `• ${a.task}${a.owner ? " (" + a.owner + ")" : ""}`).join("\n");
    const link = APP;

    let resp;
    if (target === "notion") {
      resp = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({
          parent: { page_id: cfg.parent },
          properties: { title: { title: [{ text: { content: title } }] } },
          children: [
            { object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: "Summary" } }] } },
            { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: summary.slice(0, 1900) || "-" } }] } },
            { object: "block", type: "heading_2", heading_2: { rich_text: [{ text: { content: "Action Items" } }] } },
            ...(r.action_items || []).slice(0, 25).map((a) => ({ object: "block", type: "to_do", to_do: { rich_text: [{ text: { content: (a.task + (a.owner ? " (" + a.owner + ")" : "")).slice(0, 1900) } }] } })),
            { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: "Full report: " + link, link: { url: link } } }] } },
          ],
        }),
      });
    } else if (target === "slack") {
      resp = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `*${title}*  ·  OctoMeet Score ${score}\n${summary}\n\n*Action items:*\n${actions || "-"}\n\n<${link}|Open full report>` }) });
    } else if (target === "discord") {
      resp = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: `**${title}** · OctoMeet Score ${score}\n${summary}\n\nAction items:\n${actions || "-"}\n${link}` }) });
    } else {
      // generic webhook (works with Zapier/Make/native webhooks for HubSpot/Salesforce/Confluence/etc.)
      resp = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, date: m.start_time, score, summary, action_items: r.action_items || [], next_steps: r.next_steps || [], link }) });
    }
    if (!resp.ok) { const tx = await resp.text().catch(() => ""); return res.status(502).json({ error: "delivery failed", status: resp.status, detail: tx.slice(0, 200) }); }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
