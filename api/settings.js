// GET/POST user settings (auto_join, notetaker_name) on app_users.
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
    const uid = await userId(req);
    if (!uid) return res.status(401).json({ error: "not authenticated" });

    // Report Sharing preference defaults (auto-recap ON by default).
    const PREF_DEFAULTS = { autoRecap: true, internalAccess: true, externalAccess: false, oneClick: true, internalRole: "Editor", updateCalendar: true };
    if (req.method === "GET") {
      const u = await sb(`app_users?id=eq.${uid}&select=auto_join,notetaker_name,recall_calendar_id,recall_calendar_status,sharing_prefs,policy`);
      const row = u[0] || {};
      const prefs = { ...PREF_DEFAULTS, ...((row.sharing_prefs && typeof row.sharing_prefs === "object") ? row.sharing_prefs : {}) };
      const policy = (row.policy && typeof row.policy === "object") ? row.policy : {};
      return res.status(200).json({ auto_join: row.auto_join !== false, notetaker_name: row.notetaker_name || "OctoMeet AI", recall_connected: !!row.recall_calendar_id, recall_status: row.recall_calendar_status || null, sharing_prefs: prefs, policy });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const patch = {};
      if (typeof body.auto_join === "boolean") patch.auto_join = body.auto_join;
      if (typeof body.notetaker_name === "string") patch.notetaker_name = body.notetaker_name.slice(0, 80);
      if (body.sharing_prefs && typeof body.sharing_prefs === "object") {
        const cur = (await sb(`app_users?id=eq.${uid}&select=sharing_prefs`))[0] || {};
        patch.sharing_prefs = { ...PREF_DEFAULTS, ...((cur.sharing_prefs && typeof cur.sharing_prefs === "object") ? cur.sharing_prefs : {}), ...body.sharing_prefs };
      }
      // Meeting Policy: store the whole object AND sync the auto_join + notetaker_name columns
      // the cron/calendar arming already reads, so policy actually drives the bot.
      if (body.policy && typeof body.policy === "object") {
        const cur = (await sb(`app_users?id=eq.${uid}&select=policy`))[0] || {};
        patch.policy = { ...((cur.policy && typeof cur.policy === "object") ? cur.policy : {}), ...body.policy };
        if (typeof patch.policy.autoJoin === "boolean") patch.auto_join = patch.policy.autoJoin;
        if (typeof patch.policy.notetakerName === "string") patch.notetaker_name = patch.policy.notetakerName.slice(0, 80);
      }
      if (Object.keys(patch).length) await sb(`app_users?id=eq.${uid}`, { method: "PATCH", body: patch });
      return res.status(200).json({ ok: true, ...patch });
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
