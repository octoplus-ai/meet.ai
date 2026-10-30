// Recall.ai webhook: fires when a bot finishes / transcript is ready.
// On transcript.done it builds the full report (transcript from media_shortcuts,
// rich AI analysis, participants, duration). Bot-status events update live status.
import { sb } from "../lib/supa.js";
import { mapStatus } from "../lib/recall.js";
import { recoverRecallMeeting } from '../lib/recall-recovery.js';
import { usesRecall } from '../lib/processing-state.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  try {
    // Shared-secret guard: configure the Recall webhook URL with ?key=RECALL_WEBHOOK_SECRET.
    const key = new URL(req.url, "http://x").searchParams.get("key");
    if (!process.env.RECALL_WEBHOOK_SECRET) return res.status(503).json({ error: 'webhook_unavailable' });
    if (key !== process.env.RECALL_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const ev = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const botId = ev?.data?.bot_id ?? ev?.bot?.id ?? ev?.data?.bot?.id ?? ev?.data?.data?.bot?.id ?? ev?.data?.id;
    const type = ev?.event || ev?.type || "";
    if (botId == null) return res.status(200).json({ ok: true, ignored: true });
    if (typeof botId !== 'string' || !botId.trim() || botId.length > 128 || typeof type !== 'string' || type.length > 128) return res.status(400).json({ error: 'invalid_event' });

    const meetings = await sb(`meetings?bot_id=eq.${encodeURIComponent(botId)}&select=*`);
    const meeting = meetings[0];
    if (!meeting) return res.status(200).json({ ok: true, noMeeting: true });
    if (!usesRecall(meeting) || meeting.status === 'skipped') return res.status(200).json({ ok: true, ignored: true });

    const isTranscriptDone = /transcript[._-]?(done|complete|completed)/i.test(type);

    // --- Bot status events (optional): keep the live status fresh. ---
    if (!isTranscriptDone) {
      const code = (type.includes(".") ? type.split(".").pop() : type).trim().toLowerCase();
      const mapped = mapStatus(code);
      if (mapped) {
        if (meeting.status !== 'done') {
          const patch = { status: mapped, status_synced_at: new Date().toISOString() };
          if (mapped === "error") patch.error = ev?.data?.message || ev?.message || "bot failed";
          const updated = await sb(`meetings?id=eq.${encodeURIComponent(meeting.id)}&bot_id=eq.${encodeURIComponent(botId)}&status=not.in.(done,skipped)&or=(capture_mode.is.null,capture_mode.eq.recall)`, { method: "PATCH", prefer: 'return=representation', body: patch });
          if (!updated?.length) return res.status(200).json({ ok: true, ignored: true });
          return res.status(200).json({ ok: true, status: mapped });
        }
      }
      return res.status(200).json({ ok: true, skipped: type });
    }

    // --- Transcript ready: build the full report. ---
    if (meeting.status === "done") return res.status(200).json({ ok: true, alreadyDone: true });
    const result = await recoverRecallMeeting(meeting, { transcriptEvent: true });
    if (['pending', 'failed', 'limited'].includes(result.state)) {
      res.setHeader('Retry-After', String(result.retryAfter || 900));
      return res.status(503).json({ ok: false, error: 'processing_pending' });
    }
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    // Return 5xx on transient failures so Recall retries; status stays != 'done'.
    console.error('Recall webhook processing failed');
    res.status(500).json({ ok: false, error: "processing failed" });
  }
}
