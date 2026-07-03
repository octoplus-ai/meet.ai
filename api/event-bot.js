// Per-event notetaker toggle + Read Score for the OctoMeet Chrome extension (Google Calendar).
// GET  /api/event-bot?eventId=<gcal event id>  -> current state for that event
// POST /api/event-bot { eventId, enable: true|false } -> arm / disarm the bot for that single event
// Auth: OctoMeet session token (Authorization: Bearer <token>) or om_session cookie.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { listUpcomingEvents } from "./lib/google.js";
import { scheduleBot } from "./lib/schedule.js";
import { ensureShareToken } from "./lib/share.js";

const enc = encodeURIComponent;
const APP = (process.env.APP_URL || "https://meet.octoplusteam.com").replace(/\/+$/, "");
const TOGGLABLE = new Set(["scheduled", "joining", "skipped", "error"]); // done/processing = already recorded, leave alone

async function sessionUser(req, body) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const t = bearer || (body && body.token) || parseCookies(req).om_session;
  if (!t) return null;
  const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
}

// Latest meetings row linked to this calendar event (the DB enforces one per event, but be safe).
async function rowFor(uid, eventId) {
  const rows = await sb(`meetings?user_id=eq.${uid}&calendar_event_id=eq.${enc(eventId)}&select=id,status,start_time,title,meeting_url,bot_id&order=created_at.desc&limit=1`);
  return rows[0] || null;
}

// Find the live calendar event (title / meet link / start) so enable can (re)arm with fresh data.
async function findEvent(uid, eventId) {
  const { events } = await listUpcomingEvents(uid, { days: 14 }).catch(() => ({ events: [] }));
  return (events || []).find((e) => e.id === eventId) || null;
}

async function stopOrchestratorJob(meetingId) {
  const OWN = process.env.BOT_ORCHESTRATOR_URL;
  if (!OWN) return;
  try {
    await fetch(OWN.replace(/\/$/, "") + "/bots/stop-by-meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-orch-secret": process.env.ORCH_SHARED_SECRET || "" },
      body: JSON.stringify({ meetingId }),
    });
  } catch (e) { /* best-effort: pending.js won't re-arm a skipped row anyway */ }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    let body = {};
    if (req.method === "POST") { try { body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); } catch (e) {} }
    const uid = await sessionUser(req, body);
    if (!uid) return res.status(401).json({ error: "not authenticated" });

    const eventId = req.method === "POST" ? body.eventId : new URL(req.url, "http://x").searchParams.get("eventId");
    if (!eventId) return res.status(400).json({ error: "eventId required" });

    if (req.method === "GET") {
      const m = await rowFor(uid, eventId);
      if (!m) return res.status(200).json({ linked: false, enabled: true }); // default: auto-join will arm it
      const out = { linked: true, status: m.status, enabled: m.status !== "skipped" && m.status !== "error" };
      if (m.status === "done") {
        const rep = await sb(`reports?meeting_id=eq.${enc(m.id)}&select=read_score`).catch(() => []);
        out.score = rep && rep.length ? rep[0].read_score : null;
        try { out.reportUrl = APP + "/?share=" + (await ensureShareToken(m.id, uid)); } catch (e) {}
      }
      return res.status(200).json(out);
    }

    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
    const m = await rowFor(uid, eventId);
    if (m && !TOGGLABLE.has(m.status)) return res.status(200).json({ ok: false, status: m.status, error: "meeting already recorded or in progress" });

    if (body.enable === false) {
      if (m) {
        if (m.status !== "skipped") {
          await sb(`meetings?id=eq.${m.id}`, { method: "PATCH", body: { status: "skipped", status_synced_at: new Date().toISOString() } });
          await stopOrchestratorJob(m.id);
        }
        return res.status(200).json({ ok: true, enabled: false });
      }
      // No row yet: insert a "skipped" placeholder so the auto-join sweep (dedup on
      // calendar_event_id) never arms this event. Hidden from the app list.
      const ev = await findEvent(uid, eventId);
      try {
        await sb("meetings", {
          method: "POST",
          body: {
            user_id: uid, title: (ev && ev.title) || "Meeting", source: "OctoMeet Bot", capture_mode: "inhouse_bot",
            meeting_url: (ev && ev.meetingUrl) || null, start_time: (ev && ev.start) || null,
            calendar_event_id: eventId, status: "skipped", status_synced_at: new Date().toISOString(),
          },
        });
      } catch (e) { if (!/23505|duplicate/i.test(String(e.message || ""))) throw e; } // race: sweep inserted first -> re-run disable
      return res.status(200).json({ ok: true, enabled: false });
    }

    // enable === true -> (re)arm this event.
    const ev = await findEvent(uid, eventId);
    if (m && m.status === "skipped") {
      // A skipped row never produced a report; drop it and let scheduleBot recreate + arm cleanly.
      await sb(`meetings?id=eq.${m.id}`, { method: "DELETE" });
    } else if (m && m.status !== "error") {
      return res.status(200).json({ ok: true, enabled: true, status: m.status }); // already armed
    }
    const meetingUrl = (ev && ev.meetingUrl) || (m && m.meeting_url);
    if (!meetingUrl) return res.status(200).json({ ok: false, error: "no meeting link found for this event" });
    const users = await sb(`app_users?id=eq.${uid}&select=notetaker_name`).catch(() => []);
    const r = await scheduleBot(uid, {
      meetingUrl, title: (ev && ev.title) || (m && m.title) || "Meeting",
      joinAt: (ev && ev.start) || (m && m.start_time) || null, calendarEventId: eventId,
      botName: (users[0] && users[0].notetaker_name) || "OctoMeet AI",
    });
    return res.status(200).json({ ok: !!(r.ok || r.already), enabled: true, detail: r.error || undefined });
  } catch (e) {
    console.error("event-bot error:", e && (e.stack || e.message));
    res.status(500).json({ error: String(e.message || e) });
  }
}
