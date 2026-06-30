// Smart Scheduler: create a Google Calendar event WITH a Google Meet link, invite attendees,
// then auto-arm the OctoMeet bot for that future meeting (respecting Meeting Policy).
// POST { title, start (ISO w/ offset), durationMin, attendees:[email], timeZone, description? }
import crypto from "node:crypto";
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { getValidToken } from "../lib/google.js";
import { scheduleBot } from "../lib/schedule.js";

const enc = encodeURIComponent;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  res.setHeader("Cache-Control", "no-store");
  try {
    const t = parseCookies(req).om_session;
    const s = t ? await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`) : [];
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const userId = s[0].user_id;

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const title = String(body.title || "").trim().slice(0, 200) || "Meeting";
    const startISO = String(body.start || "");
    const durationMin = Math.min(240, Math.max(10, body.durationMin || 30));
    const tz = body.timeZone || "UTC";
    const startMs = Date.parse(startISO);
    if (!startMs) return res.status(400).json({ error: "bad start" });
    if (startMs < Date.now() - 60000) return res.status(400).json({ error: "start_in_past" });
    const endISO = new Date(startMs + durationMin * 60000).toISOString();
    const attendees = [...new Set((body.attendees || []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^\s,<>"]+@[^\s,<>"]+\.[^\s,<>"]+$/.test(e)))];

    const token = await getValidToken(userId);
    if (!token) return res.status(400).json({ error: "google_disconnected" });

    // Create the event with a Meet link. conferenceDataVersion=1 is required or Meet is ignored.
    const ins = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: title,
        description: String(body.description || "").slice(0, 4000),
        start: { dateTime: startISO, timeZone: tz },
        end: { dateTime: endISO, timeZone: tz },
        attendees: attendees.map((email) => ({ email })),
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    });
    const ev = await ins.json().catch(() => ({}));
    if (!ins.ok || ev.error) return res.status(502).json({ error: "create_failed", detail: (ev.error && ev.error.message) || "" });

    const meetUrl = ev.hangoutLink || (ev.conferenceData && ev.conferenceData.entryPoints && (ev.conferenceData.entryPoints.find((p) => p.entryPointType === "video") || {}).uri) || "";
    const event = { id: ev.id, hangoutLink: meetUrl, htmlLink: ev.htmlLink, start: (ev.start && ev.start.dateTime) || startISO, title };

    // Auto-arm the bot (respect Meeting Policy). Future joinAt -> scheduleBot sets join_at + status "scheduled".
    let armed = { skippedAutoJoinOff: true };
    const u = (await sb(`app_users?id=eq.${userId}&select=auto_join,notetaker_name,policy`))[0] || {};
    const policy = (u.policy && typeof u.policy === "object") ? u.policy : {};
    const autoJoin = typeof policy.autoJoin === "boolean" ? policy.autoJoin : (u.auto_join !== false);
    const botName = policy.notetakerName || u.notetaker_name || "OctoMeet AI";
    if (!meetUrl) armed = { error: "no_meet_link" };
    else if (autoJoin) {
      try { armed = await scheduleBot(userId, { meetingUrl: meetUrl, title, joinAt: event.start, calendarEventId: ev.id, botName }); }
      catch (e) { armed = { error: String(e.message || e) }; }
    }

    return res.status(200).json({ ok: true, event, armed });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
