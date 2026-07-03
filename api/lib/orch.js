// In-house bot orchestrator helpers (Fly.io). Shared by event-bot, bot/stop and the
// disarm pass in schedule.js so every "stop this bot" path talks to the same endpoint.
export async function stopOrchestratorJob(meetingId) {
  const OWN = process.env.BOT_ORCHESTRATOR_URL;
  if (!OWN) return;
  try {
    await fetch(OWN.replace(/\/$/, "") + "/bots/stop-by-meeting", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-orch-secret": process.env.ORCH_SHARED_SECRET || "" },
      body: JSON.stringify({ meetingId }),
    });
  } catch (e) { /* best-effort: pending.js won't re-arm a skipped row anyway */ }
}
