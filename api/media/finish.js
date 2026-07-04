// Botless finish relay: the add-on posts here when the capture stops. We create the meetings
// row IMMEDIATELY (the app shows "processing" even if ASR takes minutes or dies) and either
// (a) hand an already-hosted audio URL to the orchestrator's ASR relay, or (b) - the normal
// add-on path - mint a per-meeting HMAC upload pass so the panel POSTs the audio blob DIRECTLY
// to the orchestrator (/media/upload), which uploads to AssemblyAI and calls back
// /api/media/ingest. Vercel caps request bodies at ~4.5MB, so the audio can never come through here.
// POST { meetingCode, title, durationMin, audioUrl?, calendarEventId? } - session auth.
import { createHmac } from "node:crypto";
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";

const enc = encodeURIComponent;
const APP = (process.env.APP_URL || "https://meet.octoplusteam.com").replace(/\/+$/, "");

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
    const OWN = process.env.BOT_ORCHESTRATOR_URL;
    if (!OWN) return res.status(501).json({ error: "orchestrator not configured" });

    const durationMin = Number(body.durationMin) || null;
    const created = await sb("meetings", {
      method: "POST", prefer: "return=representation",
      body: {
        user_id: uid, title: body.title || "Live meeting", source: body.source || "Meet (botless)",
        meeting_url: body.meetingCode ? "https://meet.google.com/" + body.meetingCode : null,
        status: "processing", capture_mode: "media_api",
        start_time: new Date(Date.now() - (durationMin || 0) * 60000).toISOString(),
        duration_min: durationMin, calendar_event_id: body.calendarEventId || null,
      },
    });
    const row = created[0];

    // Normal add-on path: no hosted audio yet -> hand back a one-meeting upload pass. The pass
    // is hmac(ORCH_SHARED_SECRET, meetingId), verified by the orchestrator - the browser never
    // holds the secret and the pass unlocks nothing but this meeting's upload slot.
    if (!body.audioUrl) {
      const pass = createHmac("sha256", process.env.ORCH_SHARED_SECRET || "").update(String(row.id)).digest("hex");
      return res.status(200).json({ ok: true, meetingId: row.id, uploadUrl: OWN.replace(/\/$/, "") + "/media/upload", pass });
    }

    const r = await fetch(OWN.replace(/\/$/, "") + "/media/asr", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-orch-secret": process.env.ORCH_SHARED_SECRET || "" },
      body: JSON.stringify({ audioUrl: body.audioUrl, meetingId: row.id, callbackUrl: APP + "/api/media/ingest", callbackSecret: process.env.BOT_INGEST_SECRET }),
    }).catch(() => null);
    if (!r || !r.ok) {
      const detail = r ? await r.text().catch(() => "") : "orchestrator unreachable";
      await sb(`meetings?id=eq.${row.id}`, { method: "PATCH", body: { status: "error", error: "ASR relay failed: " + String(detail).slice(0, 200), status_synced_at: new Date().toISOString() } });
      return res.status(502).json({ error: "asr relay failed" });
    }
    return res.status(200).json({ ok: true, meetingId: row.id });
  } catch (e) {
    console.error("media finish error:", e && (e.stack || e.message));
    res.status(500).json({ error: String(e.message || e) });
  }
}
