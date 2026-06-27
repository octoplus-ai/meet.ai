// Recall.ai helpers: fetch a bot and map its live status into our own status model.
const RECALL_BASE = process.env.RECALL_REGION_URL || "https://us-west-2.recall.ai";

export function recallBase() { return RECALL_BASE; }

export async function getBot(botId) {
  const r = await fetch(`${RECALL_BASE}/api/v1/bot/${botId}/`, {
    headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

// Latest status code from the bot's status_changes timeline.
export function latestCode(bot) {
  const sc = (bot && bot.status_changes) || [];
  if (sc.length) return sc[sc.length - 1].code || null;
  return (bot && bot.status && bot.status.code) || null;
}

// Map a Recall status code to our app status: scheduled | joining | in_call | recording | processing | done | error
export function mapStatus(code) {
  switch (code) {
    case "scheduled": return "scheduled";
    case "ready": return "joining";
    case "joining_call": return "joining";
    case "in_waiting_room": return "joining";
    case "in_call_not_recording": return "in_call";
    case "recording_permission_allowed": return "recording";
    case "in_call_recording": return "recording";
    case "recording_permission_denied": return "error";
    case "call_ended": return "processing";
    case "recording_done": return "processing";
    case "done": return "processing";
    case "analysis_done": return "processing";
    case "fatal": return "error";
    default: return null;
  }
}

// Approximate meeting duration (minutes) from the recording window.
export function durationMin(bot) {
  const sc = (bot && bot.status_changes) || [];
  const start = sc.find((s) => /in_call_recording|recording_permission_allowed|in_call_not_recording/.test(s.code || ""));
  const end = [...sc].reverse().find((s) => /call_ended|done|recording_done/.test(s.code || ""));
  if (start && end && start.created_at && end.created_at) {
    const ms = new Date(end.created_at) - new Date(start.created_at);
    if (ms > 0) return Math.max(1, Math.round(ms / 60000));
  }
  return null;
}

// Best-effort participant names from the bot payload.
export function participants(bot) {
  const p = (bot && (bot.meeting_participants || bot.participants)) || [];
  const names = p.map((x) => (typeof x === "string" ? x : x.name)).filter(Boolean);
  return [...new Set(names)];
}
