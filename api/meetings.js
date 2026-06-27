// Returns the current user's real meetings (with their reports) from Supabase.
// For meetings still in progress, it syncs the live status from Recall so the UI
// can show "recording" / "processing" badges that update on each poll.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { getBot, latestCode, mapStatus, durationMin, participants } from "./lib/recall.js";

const ACTIVE = new Set(["scheduled", "joining", "in_call", "recording", "processing"]);

async function syncOne(m) {
  if (!m.bot_id || !ACTIVE.has(m.status)) return m;
  try {
    const bot = await getBot(m.bot_id);
    if (!bot) return m;
    const code = latestCode(bot);
    let next = mapStatus(code) || m.status;
    // Never downgrade once the report exists.
    const hasReport = Array.isArray(m.reports) && m.reports.length > 0;
    if (hasReport) next = "done";

    const patch = { status: next, status_synced_at: new Date().toISOString() };
    const dur = durationMin(bot);
    if (dur) patch.duration_min = dur;
    const ppl = participants(bot);
    if (ppl.length) patch.participants = ppl;
    if (next === "error") patch.error = (bot.status_changes || []).slice(-1)[0]?.message || "bot failed";

    if (next !== m.status || dur || ppl.length) {
      await sb(`meetings?id=eq.${m.id}`, { method: "PATCH", body: patch });
    }
    return { ...m, ...patch };
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

    // Sync live status for active meetings (bounded — only the few that aren't done).
    const active = m.filter((x) => ACTIVE.has(x.status) && x.bot_id).slice(0, 8);
    if (active.length && process.env.RECALL_API_KEY) {
      const synced = await Promise.all(active.map(syncOne));
      const byId = Object.fromEntries(synced.map((x) => [x.id, x]));
      for (let i = 0; i < m.length; i++) if (byId[m[i].id]) m[i] = byId[m[i].id];
    }

    res.status(200).json({ meetings: m });
  } catch (e) {
    console.error("meetings error:", e && (e.message || e));
    res.status(500).json({ meetings: [], error: "failed to load meetings" });
  }
}
