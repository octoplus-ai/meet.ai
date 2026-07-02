// Recall Calendar V2 webhook. On calendar.sync_events we list the changed events
// and schedule a notetaker bot for each real meeting — Recall then joins at the exact
// start time on its own. Configure this URL in Recall (Calendar webhook) with ?key=SECRET.
import { sb } from "../lib/supa.js";
import { getRecallCalendar } from "../lib/recall-calendar.js";
import { syncRecallCalendar } from "../lib/schedule.js";

export default async function handler(req, res) {
  try {
    // KILL SWITCH: in-house bot active -> Recall may never schedule bots via this webhook.
    if (process.env.BOT_ORCHESTRATOR_URL) return res.status(200).json({ ok: true, disabled: "inhouse_bot" });
    const key = new URL(req.url, "http://x").searchParams.get("key");
    if (process.env.RECALL_WEBHOOK_SECRET && key !== process.env.RECALL_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const ev = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const type = ev.event || ev.type || "";
    const calId = ev?.data?.calendar_id;
    if (!calId) return res.status(200).json({ ok: true, ignored: true });

    const u = (await sb(`app_users?recall_calendar_id=eq.${encodeURIComponent(calId)}&select=id,notetaker_name,auto_join`))[0];
    if (!u) return res.status(200).json({ ok: true, noUser: true });

    if (type.includes("calendar.update")) {
      const cal = await getRecallCalendar(calId);
      if (cal) await sb(`app_users?id=eq.${u.id}`, { method: "PATCH", body: { recall_calendar_status: cal.status || "connected" } });
      return res.status(200).json({ ok: true, updated: true });
    }

    // calendar.sync_events → schedule bots for new/updated meetings.
    if (u.auto_join === false) return res.status(200).json({ ok: true, autoJoinOff: true });
    const result = await syncRecallCalendar(u.id, calId, { botName: u.notetaker_name || "OctoMeet AI", sinceTs: ev?.data?.last_updated_ts });
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error("calendar webhook error:", e && (e.stack || e.message || e));
    res.status(500).json({ ok: false, error: "processing failed" });
  }
}
