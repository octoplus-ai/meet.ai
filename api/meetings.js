// Returns the current user's real meetings (with reports) from Supabase, and SELF-HEALS
// each active meeting by reconciling with Recall: marks bots that were never admitted
// (no recording) as "error", and generates the report itself if the webhook didn't.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { getBot, latestCode, mapStatus } from "./lib/recall.js";
import { processMeeting, reanalyzeStored } from "./lib/process.js";
import { getEventAttendees } from "./lib/google.js";

// This endpoint self-heals: it can run up to 2 full Claude re-analyses (~15-25s each) plus
// Recall syncs inside a single request. Without the raised limit it would time out mid-heal
// and leave meetings stuck. maxDuration also caps the total so the list still returns.
export const config = { maxDuration: 60 };

const ACTIVE = new Set(["scheduled", "joining", "in_call", "recording", "processing"]);
const ENDED = /call_ended|done|recording_done|fatal|recording_permission_denied|media_expired/;

async function patch(id, body) {
  await sb(`meetings?id=eq.${id}`, { method: "PATCH", body: { ...body, status_synced_at: new Date().toISOString() } });
}

async function syncOne(m) {
  if (!m.bot_id || !ACTIVE.has(m.status)) return m;
  try {
    const bot = await getBot(m.bot_id);
    if (!bot) return m;
    const code = latestCode(bot);
    const hasReport = Array.isArray(m.reports) && m.reports.length > 0;
    const rec = (bot.recordings && bot.recordings[0]) || null;
    const hasRecording = !!(rec && (rec.media_shortcuts || rec.status));
    const ended = ENDED.test(code || "");

    // Already has a report → finalize.
    if (hasReport) {
      if (m.status !== "done") { await patch(m.id, { status: "done" }); return { ...m, status: "done" }; }
      return m;
    }
    // Call ended but nothing was recorded → the bot was never admitted.
    if (ended && !hasRecording) {
      const error = "OctoMeet couldn't record this meeting — the notetaker wasn't admitted to the call.";
      await patch(m.id, { status: "error", error });
      return { ...m, status: "error", error };
    }
    // Call ended with a recording but no report yet. ONLY analyze once the transcript
    // artifact is actually ready — otherwise we'd read an empty transcript and wrongly
    // mark a good meeting as "error". If not ready yet, stay "processing" and wait.
    if (ended && hasRecording) {
      const transcriptReady = !!(rec && rec.media_shortcuts && rec.media_shortcuts.transcript && rec.media_shortcuts.transcript.data && rec.media_shortcuts.transcript.data.download_url);
      if (!transcriptReady) {
        if (m.status !== "processing") { await patch(m.id, { status: "processing" }); }
        return { ...m, status: "processing" };
      }
      try { await processMeeting(m); } catch (e) { /* will retry next poll */ }
      const rep = await sb(`meetings?id=eq.${m.id}&select=status,reports(id)`);
      const repArr = rep[0] && rep[0].reports ? (Array.isArray(rep[0].reports) ? rep[0].reports : [rep[0].reports]) : [];
      const done = repArr.length > 0;
      return { ...m, status: done ? "done" : "processing", reports: done ? [{}] : [] };
    }
    // Still in progress → reflect live status.
    const mapped = mapStatus(code) || m.status;
    if (mapped !== m.status) { await patch(m.id, { status: mapped }); return { ...m, status: mapped }; }
    return m;
  } catch (e) {
    return m;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ meetings: [], error: "not authenticated" });
    // status=neq.skipped: per-event "disable notetaker" placeholders (calendar extension) never show in the app.
    const m = await sb(`meetings?user_id=eq.${s[0].user_id}&status=neq.skipped&select=*,reports(*)&order=created_at.desc`);
    // PostgREST embeds `reports` as a single OBJECT (reports.meeting_id is unique → to-one),
    // not an array. Normalize to an array so the client (m.reports[0]) and the checks below work.
    for (const x of m) x.reports = x.reports ? (Array.isArray(x.reports) ? x.reports : [x.reports]) : [];

    const active = m.filter((x) => ACTIVE.has(x.status) && x.bot_id).slice(0, 8);
    if (active.length && process.env.RECALL_API_KEY) {
      const synced = await Promise.all(active.map(syncOne));
      const byId = Object.fromEntries(synced.map((x) => [x.id, x]));
      // Re-fetch rows that just finished so the client gets the fresh report payload.
      const changed = synced.filter((x) => x.status === "done");
      const fresh = changed.length ? await sb(`meetings?id=in.(${changed.map((x) => x.id).join(",")})&select=*,reports(*)`) : [];
      for (const x of fresh) x.reports = x.reports ? (Array.isArray(x.reports) ? x.reports : [x.reports]) : [];
      const freshById = Object.fromEntries(fresh.map((x) => [x.id, x]));
      for (let i = 0; i < m.length; i++) {
        if (freshById[m[i].id]) m[i] = freshById[m[i].id];
        else if (byId[m[i].id]) m[i] = { ...m[i], status: byId[m[i].id].status, error: byId[m[i].id].error };
      }
    }

    // Self-heal failed ANALYSIS: a meeting that is done and has a real transcript but an
    // empty summary means the AI report failed (e.g. earlier truncation). Regenerate it
    // with the current pipeline. Capped to keep the request fast; succeeds → stops retrying.
    const broken = m.filter((x) => x.status === "done" && x.bot_id && x.reports[0]
      && !((x.reports[0].summary || "").trim())
      && ((x.reports[0].transcript || "").length > 50)).slice(0, 2);
    if (broken.length && process.env.ANTHROPIC_API_KEY) {
      // Re-analyze the STORED transcript (no Recall round-trip). Using processMeeting(force)
      // here would re-fetch from Recall and, for in-house-bot meetings whose bot_id doesn't
      // exist in Recall, read an empty transcript and WRONGLY flip a good meeting to "error".
      for (const mm of broken) { try { await reanalyzeStored(mm); } catch (e) { /* retry next poll */ } }
      const ids = broken.map((x) => x.id).join(",");
      const fixed = await sb(`meetings?id=in.(${ids})&select=*,reports(*)`);
      for (const x of fixed) x.reports = x.reports ? (Array.isArray(x.reports) ? x.reports : [x.reports]) : [];
      const fixedById = Object.fromEntries(fixed.map((x) => [x.id, x]));
      for (let i = 0; i < m.length; i++) if (fixedById[m[i].id]) m[i] = fixedById[m[i].id];
    }
    // Backfill invitee emails: meetings that came from a calendar invite but never had their
    // attendee list saved. The invite is where a participant's email actually lives (Recall only
    // gives names), so this is what makes "copy/email participants" have real emails. One-time
    // per meeting (once saved, it's skipped); capped so the request stays fast.
    const needAtt = m.filter((x) => x.calendar_event_id && (!Array.isArray(x.attendees) || x.attendees.length === 0)).slice(0, 8);
    if (needAtt.length && process.env.GOOGLE_CLIENT_SECRET) {
      await Promise.all(needAtt.map(async (mm) => {
        try {
          const att = await getEventAttendees(s[0].user_id, mm.calendar_event_id);
          if (att.length) { await sb(`meetings?id=eq.${mm.id}`, { method: "PATCH", body: { attendees: att } }); mm.attendees = att; }
        } catch (e) { /* leave attendees null; retry next load */ }
      }));
    }

    res.status(200).json({ meetings: m });
  } catch (e) {
    console.error("meetings error:", e && (e.message || e));
    res.status(500).json({ meetings: [], error: "failed to load meetings" });
  }
}
