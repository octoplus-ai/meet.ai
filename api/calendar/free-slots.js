// Smart Scheduler: find free slots in the user's Google Calendar via freebusy.query.
// POST { fromDate?, days?, durationMin?, workStartHour?, workEndHour?, timeZone?, includeWeekends? }
// -> { slots: [{start, end}], timeZone }. Uses the already-granted calendar.events scope.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { getValidToken } from "../lib/google.js";

const enc = encodeURIComponent;

// Minutes that `tz` is ahead of UTC at instant `at` (epoch ms).
function tzOffsetMinutes(tz, at) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = {}; for (const x of dtf.formatToParts(new Date(at))) p[x.type] = x.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
  return Math.round((asUTC - at) / 60000);
}
// Epoch ms for a wall-clock Y-M-D H:M in `tz`.
function zonedEpoch(y, mo, d, h, mi, tz) {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  guess -= tzOffsetMinutes(tz, guess) * 60000;
  // one correction pass for DST edges
  guess = Date.UTC(y, mo - 1, d, h, mi) - tzOffsetMinutes(tz, guess) * 60000;
  return guess;
}
function ymdInTz(at, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = {}; for (const x of dtf.formatToParts(new Date(at))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, weekday: p.weekday };
}
function zonedISO(at, tz) {
  const off = tzOffsetMinutes(tz, at);
  const sign = off >= 0 ? "+" : "-", abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0"), mm = String(abs % 60).padStart(2, "0");
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = {}; for (const x of dtf.formatToParts(new Date(at))) p[x.type] = x.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}${sign}${hh}:${mm}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  res.setHeader("Cache-Control", "no-store");
  try {
    const t = parseCookies(req).om_session;
    const s = t ? await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`) : [];
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const userId = s[0].user_id;

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const tz = body.timeZone || "UTC";
    const days = Math.min(21, Math.max(1, body.days || 7));
    const durationMin = Math.min(240, Math.max(10, body.durationMin || 30));
    const workStartHour = Math.min(23, Math.max(0, body.workStartHour != null ? body.workStartHour : 9));
    const workEndHour = Math.min(24, Math.max(workStartHour + 1, body.workEndHour != null ? body.workEndHour : 18));
    const includeWeekends = !!body.includeWeekends;

    const token = await getValidToken(userId);
    if (!token) return res.status(400).json({ error: "google_disconnected" });

    const now = Date.now();
    // Start date = provided fromDate (in tz) or today (in tz).
    let startY, startMo, startD;
    if (/^\d{4}-\d{2}-\d{2}$/.test(body.fromDate || "")) { const [y, mo, d] = body.fromDate.split("-").map(Number); startY = y; startMo = mo; startD = d; }
    else { const td = ymdInTz(now, tz); startY = td.y; startMo = td.mo; startD = td.d; }
    const startNoon = zonedEpoch(startY, startMo, startD, 12, 0, tz);
    const rangeStart = Math.min(startNoon - 12 * 3600000, now);
    const rangeEnd = startNoon + (days - 1) * 86400000 + 12 * 3600000;

    // Ask Google for busy intervals in the window.
    const fb = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: new Date(rangeStart).toISOString(), timeMax: new Date(rangeEnd).toISOString(), timeZone: tz, items: [{ id: "primary" }] }),
    });
    const fbj = await fb.json().catch(() => ({}));
    if (!fb.ok || fbj.error) return res.status(502).json({ error: "calendar_auth_failed", detail: (fbj.error && fbj.error.message) || "" });
    const busy = (((fbj.calendars || {}).primary || {}).busy || []).map((b) => [Date.parse(b.start), Date.parse(b.end)]);
    const overlaps = (a0, a1) => busy.some(([b0, b1]) => a0 < b1 && a1 > b0);

    const slots = [];
    const step = durationMin * 60000;
    for (let dOff = 0; dOff < days && slots.length < 40; dOff++) {
      const day = ymdInTz(startNoon + dOff * 86400000, tz);
      if (!includeWeekends && (day.weekday === "Sat" || day.weekday === "Sun")) continue;
      const dayEnd = zonedEpoch(day.y, day.mo, day.d, workEndHour === 24 ? 23 : workEndHour, workEndHour === 24 ? 59 : 0, tz);
      let cursor = zonedEpoch(day.y, day.mo, day.d, workStartHour, 0, tz);
      // round today's start up to the next slot boundary after now
      if (cursor < now) cursor = Math.ceil((now - zonedEpoch(day.y, day.mo, day.d, workStartHour, 0, tz)) / step) * step + zonedEpoch(day.y, day.mo, day.d, workStartHour, 0, tz);
      for (; cursor + step <= dayEnd && slots.length < 40; cursor += step) {
        if (cursor < now) continue;
        if (overlaps(cursor, cursor + step)) continue;
        slots.push({ start: zonedISO(cursor, tz), end: zonedISO(cursor + step, tz) });
      }
    }
    return res.status(200).json({ slots, timeZone: tz });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
