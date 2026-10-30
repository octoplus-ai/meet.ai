import { IntegrationError, normalizeIntegrationConfig, sendIntegrationJson } from './integration-security.js';

// Shared by manual Push and auto-push. Revalidate legacy rows on EVERY delivery;
// provider response bodies, credentials and destination URLs never enter errors.
export function createReportDelivery({ send = sendIntegrationJson } = {}) {
  return async function deliverReport(target, cfg, data, { timeoutMs = 10000 } = {}) {
    if (!cfg || !(cfg.url || cfg.token)) return { ok: false, error: 'not_connected' };
    try {
      cfg = normalizeIntegrationConfig(target, cfg);
      const title = data.title || 'Meeting', summary = data.summary || '', score = data.score || 0;
      const actionItems = Array.isArray(data.actionItems) ? data.actionItems : [];
      const actions = actionItems.map(a => `• ${a.task}${a.owner ? ' (' + a.owner + ')' : ''}`).join('\n');
      const link = data.link;
      let url = cfg.url, headers = {}, payload;
      if (target === 'notion') {
        url = 'https://api.notion.com/v1/pages';
        headers = { Authorization: `Bearer ${cfg.token}`, 'Notion-Version': '2022-06-28' };
        payload = {
          parent: { page_id: cfg.parent }, properties: { title: { title: [{ text: { content: title } }] } },
          children: [
            { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Summary' } }] } },
            { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: summary.slice(0, 1900) || '-' } }] } },
            { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Action Items' } }] } },
            ...actionItems.slice(0, 25).map(a => ({ object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: (a.task + (a.owner ? ' (' + a.owner + ')' : '')).slice(0, 1900) } }] } })),
            { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Full report: ' + link, link: { url: link } } }] } },
          ],
        };
      } else if (target === 'slack') {
        payload = { text: `*${title}*  ·  OctoMeet Score ${score}\n${summary}\n\n*Action items:*\n${actions || '-'}\n\n<${link}|Open full report>` };
      } else if (target === 'discord') {
        payload = { content: `**${title}** · OctoMeet Score ${score}\n${summary}\n\nAction items:\n${actions || '-'}\n${link}` };
      } else {
        payload = { title, date: data.date, score, summary, action_items: actionItems, next_steps: data.nextSteps || [], link };
      }
      const response = await send(url, { timeoutMs, headers, body: JSON.stringify(payload) });
      if (response.status >= 300 && response.status < 400) return { ok: false, error: 'integration_redirect_not_allowed', status: response.status };
      return response.ok ? { ok: true } : { ok: false, error: 'delivery_failed', status: response.status };
    } catch (error) {
      if (error instanceof IntegrationError) return { ok: false, error: error.code, status: error.status,
        ...(error.code === 'integration_delivery_unconfirmed' ? { uncertain: true } : {}) };
      return { ok: false, error: 'integration_delivery_unconfirmed', uncertain: true };
    }
  };
}
export const deliverReport = createReportDelivery();
