// Per-event notetaker toggle + Read Score for the OctoMeet Chrome extension (Google Calendar).
// GET  /api/event-bot?eventId=<gcal event id>  -> current state for that event
// POST /api/event-bot { eventId, enable: true|false } -> arm / disarm the bot for that single event
// Auth: OctoMeet session token (Authorization: Bearer <token>) or om_session cookie.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { listUpcomingEvents } from "./lib/google.js";
import { scheduleBot } from "./lib/schedule.js";
import { ensureShareToken } from "./lib/share.js";
import { stopOrchestratorJob } from "./lib/orch.js";

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
  const rows = await sb(`meetings?user_id=eq.${uid}&calendar_event_id=eq.${enc(eventId)}&select=id,status,start_time,title,meeting_url,bot_id,attendees,duration_min&order=created_at.desc&limit=1`);
  return rows[0] || null;
}

// Find the live calendar event (title / meet link / start) so enable can (re)arm with fresh data.
async function findEvent(uid, eventId) {
  const { events } = await listUpcomingEvents(uid, { days: 14 }).catch(() => ({ events: [] }));
  return (events || []).find((e) => e.id === eventId) || null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    let body = {};
    if (req.method === "POST") { try { body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}"); } catch (e) {} }
    const uid = await sessionUser(req, body);
    if (!uid) return res.status(401).json({ error: "not authenticated" });

    const url = new URL(req.url, "http://x");

    // Batch: GET ?eventIds=a,b,c (up to 100) -> { states } in ONE query. Feeds the extension's
    // whole calendar grid, so it must stay fast: no event lookups, no share-token minting.
    if (req.method === "GET" && url.searchParams.get("eventIds")) {
      const ids = url.searchParams.get("eventIds").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
      if (!ids.length) return res.status(400).json({ error: "eventIds required" });
      const inList = ids.map((i) => enc(`"${i.replace(/"/g, "")}"`)).join(",");
      const rows = await sb(`meetings?user_id=eq.${uid}&calendar_event_id=in.(${inList})&select=id,calendar_event_id,status,reports(read_score)`);
      const states = {};
      for (const r of rows) {
        // PostgREST embeds reports as a single object when meeting_id is unique - normalize both shapes.
        const rep = Array.isArray(r.reports) ? r.reports[0] : r.reports;
        states[r.calendar_event_id] = { status: r.status, score: rep && rep.read_score != null ? rep.read_score : null };
      }
      return res.status(200).json({ states });
    }

    const eventId = req.method === "POST" ? body.eventId : url.searchParams.get("eventId");
    if (!eventId) return res.status(400).json({ error: "eventId required" });

    if (req.method === "GET") {
      const m = await rowFor(uid, eventId);
      // Duration + guest count for the extension card: live event first, meetings row as fallback.
      const ev = await findEvent(uid, eventId);
      let durationMin = null;
      if (ev && ev.start && ev.end) { const ms = new Date(ev.end) - new Date(ev.start); if (ms > 0) durationMin = Math.round(ms / 60000); }
      else if (m && m.duration_min) durationMin = m.duration_min;
      const guestCount = (ev && ev.attendees > 0) ? ev.attendees
        : (m && Array.isArray(m.attendees) && m.attendees.length ? m.attendees.length : null);
      if (!m) {
        // Unlinked event: "enabled" means "auto-join WILL arm it", which is only true when the
        // user's auto_join pref is on - never hardcode it.
        const u = await sb(`app_users?id=eq.${uid}&select=auto_join`).catch(() => []);
        return res.status(200).json({ linked: false, enabled: (u[0] || {}).auto_join !== false, durationMin, guestCount });
      }
      const out = { linked: true, status: m.status, enabled: m.status !== "skipped" && m.status !== "error", durationMin, guestCount };
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
