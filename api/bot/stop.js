// Stop the notetaker for the CURRENT meeting, from the Meet add-on side panel.
// POST /api/bot/stop { meetingUrl } -> skips the caller's active meetings row + tells the
// orchestrator to kill the bot job. Auth: OctoMeet session token (Bearer / body.token / cookie).
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { stopOrchestratorJob } from "../lib/orch.js";
import { disableRtmsMeeting } from '../lib/zoom-rtms.js';
import { parseMeetingUrl } from '../../shared/meeting-platform.js';

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

    let parsed; try { parsed = parseMeetingUrl(body.meetingUrl); } catch { return res.status(400).json({ error: 'invalid_meeting_url' }); }
    const rows = await sb(`meetings?user_id=eq.${uid}&status=in.(scheduled,joining,in_call,recording,processing)&select=id,status,start_time,end_time,meeting_url,capture_mode&order=created_at.desc`);
    const m = rows.find(row => {
      if (row.status === 'processing' && row.capture_mode !== 'zoom_rtms') return false;
      try { const other = parseMeetingUrl(row.meeting_url); return other.platform === parsed.platform && (other.meetingId && parsed.meetingId ? other.meetingId === parsed.meetingId : other.url === parsed.url) && (row.status !== 'scheduled' || Date.parse(row.start_time) <= Date.now()+300000 && Date.parse(row.end_time || new Date(Date.parse(row.start_time)+7200000)) + 300000 > Date.now()); } catch { return false; }
    });
    if (!m) return res.status(404).json({ error: "no active bot for this meeting" });

    if (m.capture_mode === 'zoom_rtms') return res.status(200).json(await disableRtmsMeeting(uid, m.id));
    const changed = await sb(`meetings?id=eq.${m.id}&user_id=eq.${uid}&status=eq.${m.status}`, { method: "PATCH", prefer: 'return=representation', body: { status: "skipped", status_synced_at: new Date().toISOString() } });
    if (!changed?.length) return res.status(409).json({ error: 'meeting_state_changed' });
    await stopOrchestratorJob(m.id);
    return res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'bot_stop_failed' });
  }
}
