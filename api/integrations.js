import { sb } from './lib/supa.js';
import { parseCookies } from './lib/session.js';
import { IntegrationError, integrationTarget, normalizeIntegrationConfig, validateIntegrationConfig } from './lib/integration-security.js';

export function createIntegrationsHandler({ database = sb, validate = validateIntegrationConfig } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
    try {
      const token = parseCookies(req).om_session;
      if (!token) return res.status(401).json({ error: 'not_authenticated' });
      const sessions = await database(`sessions?token=eq.${encodeURIComponent(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
      const id = sessions?.[0]?.user_id;
      if (!id) return res.status(401).json({ error: 'not_authenticated' });
      if (req.method === 'GET') {
        const users = await database(`app_users?id=eq.${encodeURIComponent(id)}&select=integrations`);
        const connected = {};
        for (const [key, config] of Object.entries(users?.[0]?.integrations || {})) {
          if (!integrationTarget(key)) continue;
          try { normalizeIntegrationConfig(key, config); connected[key] = true; } catch { connected[key] = false; }
        }
        return res.status(200).json({ connected });
      }
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return res.status(415).json({ error: 'json_required' });
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'invalid_request' }); }
      if (!body || Array.isArray(body) || !integrationTarget(body.target) || !Object.hasOwn(body, 'config')) return res.status(400).json({ error: 'invalid_request' });
      // Disconnect never resolves or contacts an old destination, even if the
      // legacy URL is invalid or its DNS is unavailable.
      const config = body.config === null ? null : await validate(body.target, body.config);
      const users = await database(`app_users?id=eq.${encodeURIComponent(id)}&select=integrations`);
      const integrations = { ...(users?.[0]?.integrations || {}) };
      if (config === null) delete integrations[body.target]; else integrations[body.target] = config;
      await database(`app_users?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { integrations } });
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(error instanceof IntegrationError ? error.status : 500).json({ error: error instanceof IntegrationError ? error.code : 'integration_update_failed' });
    }
  };
}
export default createIntegrationsHandler();
