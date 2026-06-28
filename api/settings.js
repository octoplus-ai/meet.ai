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

    if (req.method === "GET") {
      const u = await sb(`app_users?id=eq.${uid}&select=auto_join,notetaker_name,recall_calendar_id,recall_calendar_status`);
      const row = u[0] || {};
      return res.status(200).json({ auto_join: row.auto_join !== false, notetaker_name: row.notetaker_name || "OctoMeet AI", recall_connected: !!row.recall_calendar_id, recall_status: row.recall_calendar_status || null });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const patch = {};
      if (typeof body.auto_join === "boolean") patch.auto_join = body.auto_join;
      if (typeof body.notetaker_name === "string") patch.notetaker_name = body.notetaker_name.slice(0, 80);
      if (Object.keys(patch).length) await sb(`app_users?id=eq.${uid}`, { method: "PATCH", body: patch });
      return res.status(200).json({ ok: true, ...patch });
    }
    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
