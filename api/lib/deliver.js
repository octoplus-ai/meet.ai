// Deliver a report to one connected integration (Slack/Discord/Notion/generic webhook).
// Shared by /api/push (manual) and the report pipeline (auto-push). Returns {ok,status,detail}.
export async function deliverReport(target, cfg, data) {
  if (!cfg || !(cfg.url || cfg.token)) return { ok: false, error: "not_connected" };
  const title = data.title || "Meeting";
  const summary = data.summary || "";
  const score = data.score || 0;
  const actionItems = Array.isArray(data.actionItems) ? data.actionItems : [];
  const actions = actionItems.map((a) => `• ${a.task}${a.owner ? " (" + a.owner + ")" : ""}`).join("\n");
  const link = data.link;
  let resp;
  try {
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
            ...actionItems.slice(0, 25).map((a) => ({ object: "block", type: "to_do", to_do: { rich_text: [{ text: { content: (a.task + (a.owner ? " (" + a.owner + ")" : "")).slice(0, 1900) } }] } })),
            { object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content: "Full report: " + link, link: { url: link } } }] } },
          ],
        }),
      });
    } else if (target === "slack") {
      resp = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `*${title}*  ·  OctoMeet Score ${score}\n${summary}\n\n*Action items:*\n${actions || "-"}\n\n<${link}|Open full report>` }) });
    } else if (target === "discord") {
      resp = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: `**${title}** · OctoMeet Score ${score}\n${summary}\n\nAction items:\n${actions || "-"}\n${link}` }) });
    } else {
      resp = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, date: data.date, score, summary, action_items: actionItems, next_steps: data.nextSteps || [], link }) });
    }
    if (!resp.ok) { const tx = await resp.text().catch(() => ""); return { ok: false, error: "delivery_failed", status: resp.status, detail: tx.slice(0, 200) }; }
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
