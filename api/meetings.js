// Returns the current user's real meetings (with reports) from Supabase, and SELF-HEALS
// each active meeting by reconciling with Recall: marks bots that were never admitted
// (no recording) as "error", and generates the report itself if the webhook didn't.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { getBot, latestCode, mapStatus } from "./lib/recall.js";
import { processMeeting } from "./lib/process.js";

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
    // Call ended with a recording but no report yet → generate it now (don't wait for the webhook).
    if (ended && hasRecording) {
      try { await processMeeting(m); } catch (e) { /* will retry next poll */ }
      const rep = await sb(`meetings?id=eq.${m.id}&select=status,reports(id)`);
      const done = rep[0] && rep[0].reports && rep[0].reports.length > 0;
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
    const m = await sb(`meetings?user_id=eq.${s[0].user_id}&select=*,reports(*)&order=created_at.desc`);

    const active = m.filter((x) => ACTIVE.has(x.status) && x.bot_id).slice(0, 8);
    if (active.length && process.env.RECALL_API_KEY) {
      const synced = await Promise.all(active.map(syncOne));
      const byId = Object.fromEntries(synced.map((x) => [x.id, x]));
      // Re-fetch rows that just finished so the client gets the fresh report payload.
      const changed = synced.filter((x) => x.status === "done");
      const fresh = changed.length ? await sb(`meetings?id=in.(${changed.map((x) => x.id).join(",")})&select=*,reports(*)`) : [];
      const freshById = Object.fromEntries(fresh.map((x) => [x.id, x]));
      for (let i = 0; i < m.length; i++) {
        if (freshById[m[i].id]) m[i] = freshById[m[i].id];
        else if (byId[m[i].id]) m[i] = { ...m[i], status: byId[m[i].id].status, error: byId[m[i].id].error };
      }
    }
    res.status(200).json({ meetings: m });
  } catch (e) {
    console.error("meetings error:", e && (e.message || e));
    res.status(500).json({ meetings: [], error: "failed to load meetings" });
  }
}
