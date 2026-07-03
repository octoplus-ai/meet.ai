// Stop the notetaker for the CURRENT meeting, from the Meet add-on side panel.
// POST /api/bot/stop { meetingUrl } -> skips the caller's active meetings row + tells the
// orchestrator to kill the bot job. Auth: OctoMeet session token (Bearer / body.token / cookie).
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { stopOrchestratorJob } from "../lib/orch.js";

const enc = encodeURIComponent;

async function sessionUser(req, body) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const t = bearer || (body && body.token) || parseCookies(req).om_session;
  if (!t) return null;
  const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    let body = {};
    try { body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); } catch (e) {}
    const uid = await sessionUser(req, body);
    if (!uid) return res.status(401).json({ error: "not authenticated" });
    if (!body.meetingUrl) return res.status(400).json({ error: "meetingUrl required" });

    const rows = await sb(`meetings?user_id=eq.${uid}&meeting_url=eq.${enc(body.meetingUrl)}&status=in.(scheduled,joining,in_call,recording)&select=id,status&order=created_at.desc&limit=1`);
    const m = rows[0];
    if (!m) return res.status(404).json({ error: "no active bot for this meeting" });

    await sb(`meetings?id=eq.${m.id}`, { method: "PATCH", body: { status: "skipped", status_synced_at: new Date().toISOString() } });
    await stopOrchestratorJob(m.id);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("bot stop error:", e && (e.stack || e.message));
    res.status(500).json({ error: String(e.message || e) });
  }
}
