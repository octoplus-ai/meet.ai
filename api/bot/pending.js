// In-house bot reconciliation feed (secret-auth). Returns every scheduled inhouse-bot meeting
// that should have an armed worker (start within [now-15min, now+7d]). The orchestrator polls
// this on startup + every few minutes so scheduled meetings SURVIVE orchestrator restarts and
// a failed "arm" POST is self-healed. Source of truth = the meetings table.
import { sb } from "../lib/supa.js";
import { effectivePlanForUser } from "../lib/internal-plan.js";
import { limitsForPlan } from "../lib/plan.js";
import { requireEnabledMeeting, meetingLimitMinutes } from "../../shared/meeting-platform.js";

export default async function handler(req, res) {
  try {
    const SECRET = process.env.BOT_INGEST_SECRET;
    const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || req.headers["x-bot-ingest-secret"] || "";
    if (!SECRET || given !== SECRET) return res.status(401).json({ error: "unauthorized" });

    // ATTENTIVE FOR THE WHOLE MEETING WINDOW. A bot that arrives before the humans (empty room) is never
    // admitted, times out after the 10-min lobby wait, and marks the meeting "error" - and this feed used to
    // exclude "error" AND stop re-arming 20 min past the start. So if you joined even slightly late, the bot
    // had already given up FOR GOOD and no bot ever came. Now we keep arming a bot across the meeting's real
    // window [start, end] (end_time when known, else a 2h default), so whenever a human shows up - however
    // late - a bot is (or is about to be) waiting in the lobby to be admitted.
    const now = Date.now();
    const DEFAULT_WINDOW_MS = 120 * 60000; // no end_time on the row -> assume a meeting up to 2h long
    const GRACE_MS = 5 * 60000;            // keep attending a few minutes past the scheduled end (meetings run long)
    const from = new Date(now - 4 * 60 * 60000).toISOString(); // 4h back: still catch a long meeting inside its window
    const to = new Date(now + 7 * 86400000).toISOString();
    const staleJoin = now - 11 * 60000;    // a "joining" row not synced in 11 min = the lobby worker died (10-min wait, no heartbeat in the lobby)
    const errCooldown = now - 90 * 1000;   // re-arm a timed-out meeting ~90s after it failed -> near-continuous lobby coverage
    // Retry ONLY admission/inactivity timeouts (empty room, host just late). NOT a denial or a redirect -
    // if the host actively rejected the bot, or the link is wrong, re-knocking every 90s would be spam.
    const RETRYABLE_ERR = /NOT_ADMITTED_TIMEOUT|REQUEST_TIMEOUT|HARD_TIMEOUT|ADMISSION_TIMEOUT/i;
    const NO_RETRY_ERR = /AUTH_REQUIRED|MEETING_DENIED|CAPTCHA_REQUIRED|POLICY_BLOCKED|PASSCODE_REQUIRED|PASSCODE_INVALID|MEETING_ENDED/i;
    const raw = await sb(
      `meetings?capture_mode=eq.inhouse_bot&status=in.(scheduled,joining,error)&start_time=gte.${encodeURIComponent(from)}&start_time=lte.${encodeURIComponent(to)}` +
      `&select=id,user_id,meeting_url,start_time,end_time,title,bot_id,status,status_synced_at,error&order=start_time.asc&limit=100`
    );
    const inWindow = (r) => {
      const startMs = r.start_time ? new Date(r.start_time).getTime() : now;
      let endMs = r.end_time ? new Date(r.end_time).getTime() : 0;
      if (!(endMs > startMs)) endMs = startMs + DEFAULT_WINDOW_MS; // missing OR stale end (e.g. a reschedule left the old end behind) -> default window
      return now < endMs + GRACE_MS; // future meetings pass (end is ahead); long-past ones are dropped
    };
    const rows = (raw || []).filter((r) => {
      try { requireEnabledMeeting(r.meeting_url, process.env); } catch { return false; }
      if (!inWindow(r)) return false; // the whole meeting window has passed -> stop attending (never loop a bot into a dead room)
      const syncMs = r.status_synced_at ? new Date(r.status_synced_at).getTime() : 0;
      if (r.status === "scheduled") return true; // future + ongoing scheduled meetings (arms/keeps the boot timer)
      if (r.status === "joining") return !r.status_synced_at || syncMs < staleJoin; // worker died in the lobby -> re-arm (a live, waiting worker stays fresh and is skipped)
      if (r.status === "error") return !NO_RETRY_ERR.test(r.error || "") && RETRYABLE_ERR.test(r.error || "") && syncMs < errCooldown; // never admitted (arrived to an empty room) -> keep trying within the window
      return false;
    });

    // SAFETY SWEEP: a meeting stuck "in_call"/"recording" whose worker stopped heartbeating (>15 min;
    // the worker re-posts "recording" every 5 min while healthy) either died mid-recording or missed
    // its one-shot "processing" post. Flip it to "processing" so the UI never shows "recording live"
    // forever. A still-uploading worker then posts "done"; a false flip self-corrects on the next
    // heartbeat (bot/status allows processing->recording). Best-effort; never blocks the pending feed.
    try {
      const staleTs = new Date(Date.now() - 15 * 60000).toISOString();
      await sb(`meetings?capture_mode=eq.inhouse_bot&status=in.(in_call,recording)&status_synced_at=lt.${encodeURIComponent(staleTs)}`,
        { method: "PATCH", body: { status: "processing", status_synced_at: new Date().toISOString() } });
    } catch (e) { /* best-effort */ }

    // Reconciliation must preserve the owner's existing plan cap after a restart.
    // An unavailable owner lookup conservatively retains the Free 60-minute cap.
    const uids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    const names = Object.create(null), caps = Object.create(null);
    if (uids.length) {
      const us = await sb(`app_users?id=in.(${uids.map(encodeURIComponent).join(",")})&select=id,email,plan,notetaker_name`).catch(() => []);
      (us || []).forEach((u) => {
        names[u.id] = u.notetaker_name || "";
        caps[u.id] = meetingLimitMinutes(limitsForPlan(effectivePlanForUser(u)).maxMeetingMin);
      });
    }

    res.status(200).json({
      pending: rows.map((r) => ({
        meetingId: r.id, botId: r.bot_id, userId: r.user_id, meetingUrl: requireEnabledMeeting(r.meeting_url, process.env).url,
        joinAt: r.start_time, title: r.title || "", botName: names[r.user_id] || "OctoMeet AI",
        maxMeetingMin: caps[r.user_id] || 60,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: "pending_feed_failed" });
  }
}
