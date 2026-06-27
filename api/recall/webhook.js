// Recall.ai webhook: fires when a bot finishes / transcript is ready.
// On transcript.done it builds the full report (transcript from media_shortcuts,
// rich AI analysis, participants, duration). Bot-status events update live status.
import { sb } from "../lib/supa.js";
import { mapStatus } from "../lib/recall.js";
import { processMeeting } from "../lib/process.js";

export default async function handler(req, res) {
  try {
    // Shared-secret guard: configure the Recall webhook URL with ?key=RECALL_WEBHOOK_SECRET.
    const key = new URL(req.url, "http://x").searchParams.get("key");
    if (process.env.RECALL_WEBHOOK_SECRET && key !== process.env.RECALL_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const ev = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const botId = ev?.data?.bot_id || ev?.bot?.id || ev?.data?.bot?.id || ev?.data?.data?.bot?.id || ev?.data?.id;
    const type = ev?.event || ev?.type || "";
    if (!botId) return res.status(200).json({ ok: true, ignored: true });

    const meetings = await sb(`meetings?bot_id=eq.${botId}&select=*`);
    const meeting = meetings[0];
    if (!meeting) return res.status(200).json({ ok: true, noMeeting: true });

    const isTranscriptDone = /transcript[._-]?(done|complete|completed)/i.test(type);

    // --- Bot status events (optional): keep the live status fresh. ---
    if (!isTranscriptDone) {
      const code = (type.includes(".") ? type.split(".").pop() : type).trim().toLowerCase();
      const mapped = mapStatus(code);
      if (mapped) {
        const cur = await sb(`meetings?id=eq.${meeting.id}&select=status`);
        if ((cur[0]?.status || meeting.status) !== "done") {
          const patch = { status: mapped, status_synced_at: new Date().toISOString() };
          if (mapped === "error") patch.error = ev?.data?.message || ev?.message || "bot failed";
          await sb(`meetings?id=eq.${meeting.id}`, { method: "PATCH", body: patch });
          return res.status(200).json({ ok: true, status: mapped });
        }
      }
      return res.status(200).json({ ok: true, skipped: type });
    }

    // --- Transcript ready: build the full report. ---
    if (meeting.status === "done") return res.status(200).json({ ok: true, alreadyDone: true });
    const result = await processMeeting(meeting);
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    // Return 5xx on transient failures so Recall retries; status stays != 'done'.
    console.error("Recall webhook error:", e && (e.stack || e.message || e));
    res.status(500).json({ ok: false, error: "processing failed" });
  }
}
