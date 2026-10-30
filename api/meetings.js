// List real meetings and reconcile saved report/capture evidence. Report generation
// runs only through bounded POST endpoints or authenticated recorder callbacks.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { getBot, latestCode, mapStatus } from "./lib/recall.js";
import { usesRecall, hasCompleteReport, meetingStateFilter, stalledNativeProcessing } from './lib/processing-state.js';
import { getEventAttendees } from "./lib/google.js";
import { serializeRtmsMedia } from './lib/rtms-media.js';
import { serializeLegacyMedia } from './lib/legacy-media.js';
import { isRtmsDeleting } from './lib/share.js';

// Listing reconciles saved evidence only. AI work belongs to the bounded POST
// reprocessing endpoint, so opening Reports cannot start parallel paid generations.
export const config = { maxDuration: 60 };

const ACTIVE = new Set(["scheduled", "joining", "in_call", "recording", "processing"]);
const ENDED = /call_ended|done|recording_done|fatal|recording_permission_denied|media_expired/;

async function patch(meeting, body) {
  const updated = await sb(meetingStateFilter(meeting), { method: "PATCH", prefer: 'return=representation', body: { ...body, status_synced_at: new Date().toISOString() } });
  if (!updated?.length) throw new Error('MEETING_STATE_CHANGED');
}

async function syncOne(m) {
  if (!usesRecall(m) || !ACTIVE.has(m.status)) return m;
  try {
    const bot = await getBot(m.bot_id);
    if (!bot) return m;
    const code = latestCode(bot);
    const hasReport = hasCompleteReport(m);
    const rec = (bot.recordings && bot.recordings[0]) || null;
    const hasRecording = !!(rec && (rec.media_shortcuts || rec.status));
    const ended = ENDED.test(code || "");

    // Already has a report → finalize.
    if (hasReport) {
      if (m.status !== "done") { await patch(m, { status: "done" }); return { ...m, status: "done" }; }
      return m;
    }
    // Call ended but nothing was recorded → the bot was never admitted.
    if (ended && !hasRecording) {
      const error = "OctoMeet couldn't record this meeting — the notetaker wasn't admitted to the call.";
      await patch(m, { status: "error", error });
      return { ...m, status: "error", error };
    }
    // Provider has a recording but no completed report yet. Keep it processing;
    // the webhook or explicit POST /api/recall/reprocess performs analysis.
    if (ended && hasRecording) {
      if (m.status !== "processing") await patch(m, { status: "processing" });
      return { ...m, status: "processing" };
    }
    // Still in progress → reflect live status.
    const mapped = mapStatus(code) || m.status;
    if (mapped !== m.status) { await patch(m, { status: mapped }); return { ...m, status: mapped }; }
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
    // Disabled placeholders stay hidden; a deletion tombstone still needs an owner completion handle.
    const allRows = await sb(`meetings?user_id=eq.${s[0].user_id}&select=*,reports(*)&order=created_at.desc`);
    const pendingDeletions = allRows.filter(isRtmsDeleting).map(row => ({ id: row.id }));
    const m = allRows.filter(row => row.status !== 'skipped' && !isRtmsDeleting(row));
    // PostgREST embeds `reports` as a single OBJECT (reports.meeting_id is unique → to-one),
    // not an array. Normalize to an array so the client (m.reports[0]) and the checks below work.
    for (const x of m) x.reports = x.reports ? (Array.isArray(x.reports) ? x.reports : [x.reports]) : [];

    for (let i = 0; i < m.length; i++) {
      const row = m[i];
      if (row.capture_mode === 'zoom_rtms') continue; // RTMS commits transactionally under its session lease.
      const complete = ['processing', 'error'].includes(row.status) && hasCompleteReport(row);
      if (!complete && !stalledNativeProcessing(row)) continue;
      try {
        // Re-read evidence before changing a stale state; a worker may just have
        // persisted its report and be about to post done.
        const current = (await sb(`meetings?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(row.user_id)}&select=*,reports(*)`))?.[0];
        if (!current || current.capture_mode === 'zoom_rtms' || !['processing', 'error'].includes(current.status)) continue;
        const ready = hasCompleteReport(current);
        if (!ready && !stalledNativeProcessing(current)) continue;
        const change = ready ? { status: 'done', error: null }
          : { status: 'error', error: 'PROCESSING_STALLED' };
        const updated = await sb(meetingStateFilter(current), { method: 'PATCH', prefer: 'return=representation', body: { ...change, status_synced_at: new Date().toISOString() } });
        if (updated?.length) m[i] = { ...current, ...updated[0], reports: current.reports ? (Array.isArray(current.reports) ? current.reports : [current.reports]) : [] };
      } catch { /* A later read retries; never claim a state the database did not accept. */ }
    }

    // Expire STALE live rows: the in-house worker beats status every 5 min while recording and
    // posts on every transition, so a joining/in_call/recording row untouched for >15 min is dead
    // (bot never admitted, meeting long over, worker died, or a rescheduled row that never ran).
    // Flip it to error so it stops driving the "recording live" banner and the incomplete count.
    const staleCut = Date.now() - 15 * 60000;
    const stale = m.filter((x) => ["joining", "in_call", "recording"].includes(x.status)
      && x.capture_mode === "inhouse_bot"
      && (!x.status_synced_at || Date.parse(x.status_synced_at) < staleCut));
    for (const x of stale) {
      try {
        await patch(x, { status: "error", error: "Recording did not complete (bot never joined or the meeting was rescheduled)." });
        x.status = "error";
      } catch (e) { /* next load retries */ }
    }

    const active = m.filter((x) => ACTIVE.has(x.status) && usesRecall(x)).slice(0, 8);
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

    res.status(200).json({ meetings: m.filter(row => !isRtmsDeleting(row)).map(row => serializeLegacyMedia(serializeRtmsMedia(row))), pendingDeletions });
  } catch (e) {
    console.error("meetings error:", e && (e.message || e));
    res.status(500).json({ meetings: [], error: "failed to load meetings" });
  }
}
