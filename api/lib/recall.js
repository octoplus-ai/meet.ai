// Recall.ai helpers: fetch a bot, map its live status, and pull the recording's
// transcript + video from the modern media_shortcuts (NOT the legacy transcript endpoint).
const RECALL_BASE = process.env.RECALL_REGION_URL || "https://us-west-2.recall.ai";

export function recallBase() { return RECALL_BASE; }

// Single source of truth for the transcript engine (a BOT's recording_config only
// accepts STREAMING providers — async providers like recallai_async are 400-rejected).
// Default: Recall's own engine in ACCURACY mode with automatic per-meeting language
// detection (language_code:"auto" + mode:"prioritize_accuracy") — transcribes each
// meeting in whatever language is actually spoken (es/pt/zh/en/…), no extra key.
// Opt-in: Deepgram Nova-3 "multi" (top code-switching) once its API key is saved in
// the Recall dashboard and RECALL_USE_DEEPGRAM=1 is set.
// Recall normalizes every provider into the same diarized schema, so getTranscript is unchanged.
export function transcriptProvider() {
  if (process.env.RECALL_USE_DEEPGRAM === "1") {
    return { deepgram_streaming: { model: "nova-3", language: "multi" } };
  }
  return { recallai_streaming: { language_code: "auto", mode: "prioritize_accuracy" } };
}
// Last-resort fallback ONLY if the chosen provider is rejected. NOTE: meeting_captions
// defaults to the meeting's caption language (often English), so this is a true last resort.
export const CAPTIONS_PROVIDER = { meeting_captions: {} };

export async function getBot(botId) {
  const r = await fetch(`${RECALL_BASE}/api/v1/bot/${botId}/`, {
    headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

export function firstRecording(bot) {
  return (bot && bot.recordings && bot.recordings[0]) || null;
}

// Fresh, signed video URL for the mixed recording (expires ~1h — fetch on demand).
export function videoUrl(bot) {
  const rec = firstRecording(bot);
  return rec?.media_shortcuts?.video_mixed?.data?.download_url || null;
}

// Download + parse the diarized transcript artifact.
// Returns { text, participants:[names], stats:[{name,isHost,words,talkSec}], turns:[{speaker,text,t}] }
export async function getTranscript(bot) {
  const rec = firstRecording(bot);
  const url = rec?.media_shortcuts?.transcript?.data?.download_url;
  const empty = { text: "", participants: [], stats: [], turns: [] };
  if (!url) return empty;
  let segs;
  try {
    const r = await fetch(url);
    segs = await r.json();
  } catch { return empty; }
  if (!Array.isArray(segs)) return empty;

  const lines = [];
  const turns = [];
  const byName = {};
  for (const seg of segs) {
    const name = (seg.participant && seg.participant.name) || seg.speaker || "Speaker";
    const isHost = !!(seg.participant && seg.participant.is_host);
    const words = (seg.words || []);
    const phrase = words.map((w) => (w.text || "")).join(" ").replace(/\s+/g, " ").trim();
    let talkSec = 0;
    if (words.length) {
      const s = words[0]?.start_timestamp?.relative;
      const e = words[words.length - 1]?.end_timestamp?.relative;
      if (typeof s === "number" && typeof e === "number" && e > s) talkSec = e - s;
    }
    const st = (byName[name] = byName[name] || { name, isHost, words: 0, talkSec: 0 });
    st.words += words.filter((w) => (w.text || "").trim()).length;
    st.talkSec += talkSec;
    if (!phrase) continue;
    const tRel = words[0]?.start_timestamp?.relative;
    const mmss = typeof tRel === "number" ? `${String(Math.floor(tRel / 60)).padStart(2, "0")}:${String(Math.floor(tRel % 60)).padStart(2, "0")}` : "";
    lines.push(`[${mmss}] ${name}: ${phrase}`);
    turns.push({ speaker: name, text: phrase, t: mmss });
  }
  const stats = Object.values(byName);
  return { text: lines.join("\n"), participants: stats.map((s) => s.name), stats, turns };
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
    default:
      console.warn("Recall: unmapped status code:", code);
      return null;
  }
}

// Approximate meeting duration (minutes) from the recording window.
export function durationMin(bot) {
  const rec = firstRecording(bot);
  if (rec && rec.started_at && rec.completed_at) {
    const ms = new Date(rec.completed_at) - new Date(rec.started_at);
    if (ms > 0) return Math.max(1, Math.round(ms / 60000));
  }
  const sc = (bot && bot.status_changes) || [];
  const start = sc.find((s) => /in_call_recording|recording_permission_allowed|in_call_not_recording/.test(s.code || ""));
  const end = [...sc].reverse().find((s) => /call_ended|done|recording_done/.test(s.code || ""));
  if (start && end && start.created_at && end.created_at) {
    const ms = new Date(end.created_at) - new Date(start.created_at);
    if (ms > 0) return Math.max(1, Math.round(ms / 60000));
  }
  return null;
}
