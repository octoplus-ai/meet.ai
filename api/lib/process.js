// Shared meeting-processing pipeline: pull the transcript + video from Recall,
// run a rich Read.ai-style analysis with Claude, and persist a full report.
import { sb } from "./supa.js";
import { getBot, getTranscript, durationMin } from "./recall.js";
import { annotateEvent } from "./google.js";

const APP_URL = "https://meet-ai-three-beige.vercel.app/";

// Rich analysis prompt — mirrors Read.ai's report surface.
export async function analyzeTranscript(text, title, participantNames) {
  const sys =
    "You are a meeting-intelligence analyst (like Read.ai). Read the transcript and return ONLY a JSON object (no markdown, no prose) with EXACTLY this shape:\n" +
    `{
  "summary": string (3-5 sentences, neutral, specific),
  "topics": string[] (3-8 short topic phrases),
  "keyQuestions": [{"q": string, "a": string}] (max 6 important questions raised + a suggested answer; [] if none),
  "actionItems": [{"owner": string, "task": string, "due": string}] (max 10; due "" if unknown),
  "nextSteps": string[] (2-6 concrete next steps / follow-ups agreed or implied),
  "chapters": [{"title": string, "summary": string}] (3-7 chronological chapters),
  "highlights": string[] (3-6 standout quotes or moments, short),
  "participants": [{"name": string, "role": string, "sentiment": "Positive"|"Neutral"|"Negative"}] (one per distinct speaker),
  "coaching": {"strengths": string[] (2-4), "improvements": string[] (2-4), "tips": string[] (2-4)},
  "scores": {"overall": int, "engagement": int, "sentiment": int, "balance": int, "clarity": int} (0-100; overall = meeting quality/Read Score, balance = how evenly people talked, clarity = how clear the communication was),
  "sentimentLabel": "Positive"|"Neutral"|"Negative",
  "sentimentTimeline": number[] (8 values from -1 to 1, sentiment across the meeting)
}\n` +
    "Infer speaker names/roles from the transcript. If the transcript is very short or empty, still return the object with best-effort/empty values and low scores. Keep every string concise.";
  const known = participantNames && participantNames.length ? `Known participants: ${participantNames.join(", ")}.\n\n` : "";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: sys,
      messages: [{ role: "user", content: `Title: ${title}\n\n${known}Transcript:\n${(text || "(no speech captured)").slice(0, 60000)}` }],
    }),
  });
  const d = await r.json();
  let out = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  out = out.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const a = out.indexOf("{"), b = out.lastIndexOf("}");
  if (a >= 0 && b >= 0) out = out.slice(a, b + 1);
  try { return JSON.parse(out); } catch {
    return { summary: "", topics: [], keyQuestions: [], actionItems: [], chapters: [], highlights: [], participants: [], coaching: {}, scores: {}, sentimentLabel: "Neutral", sentimentTimeline: [] };
  }
}

// Merge Claude's per-speaker sentiment with deterministic talk-time stats from the transcript.
function mergeParticipants(stats, aiParts) {
  const totalSec = stats.reduce((s, p) => s + (p.talkSec || 0), 0) || 1;
  const byName = {};
  (aiParts || []).forEach((p) => { if (p && p.name) byName[p.name.toLowerCase()] = p; });
  return stats.map((s) => {
    const ai = byName[(s.name || "").toLowerCase()] || {};
    const talkMin = (s.talkSec || 0) / 60;
    return {
      name: s.name,
      role: ai.role || (s.isHost ? "Host" : "Participant"),
      talkPct: Math.round((s.talkSec / totalSec) * 100),
      wpm: talkMin > 0.1 ? Math.round(s.words / talkMin) : 0,
      sentiment: ai.sentiment || "Neutral",
      isHost: s.isHost,
    };
  });
}

// Process one meeting end-to-end. force=true regenerates even if already done.
export async function processMeeting(meeting, { force = false } = {}) {
  if (!force && meeting.status === "done") {
    const existing = await sb(`reports?meeting_id=eq.${meeting.id}&select=id`);
    if (existing.length) return { skipped: "already done" };
  }

  const bot = await getBot(meeting.bot_id);
  const tr = bot ? await getTranscript(bot) : { text: "", participants: [], stats: [], turns: [] };
  const dur = bot ? durationMin(bot) : null;

  // No report unless OctoMeet actually captured content. If nothing was transcribed
  // (recorder not admitted, or no one spoke), mark the meeting as error — never a blank report.
  if (!(tr.text || "").trim()) {
    await sb(`meetings?id=eq.${meeting.id}`, {
      method: "PATCH",
      body: { status: "error", error: "OctoMeet didn't capture this meeting — it wasn't admitted, or no audio was recorded.", status_synced_at: new Date().toISOString() },
    });
    return { skipped: "no transcript" };
  }

  const ai = await analyzeTranscript(tr.text, meeting.title, tr.participants);
  const participants = mergeParticipants(tr.stats, ai.participants);
  const sc = ai.scores || {};

  const reportRow = {
    meeting_id: meeting.id, user_id: meeting.user_id,
    summary: ai.summary || "",
    action_items: ai.actionItems || [],
    next_steps: ai.nextSteps || [],
    key_questions: ai.keyQuestions || [],
    topics: ai.topics || [],
    chapters: ai.chapters || [],
    highlights: ai.highlights || [],
    coaching: ai.coaching || {},
    participants,
    sentiment_timeline: ai.sentimentTimeline || [],
    sentiment_label: ai.sentimentLabel || "Neutral",
    transcript: tr.text,
    scores: { overall: sc.overall || 0, engagement: sc.engagement || 0, sentiment: sc.sentiment || 0, balance: sc.balance || 0, clarity: sc.clarity || 0 },
    read_score: sc.overall || 0,
  };

  // Upsert: replace existing report on force, else insert (unique meeting_id dedupes races).
  if (force) await sb(`reports?meeting_id=eq.${meeting.id}`, { method: "DELETE" });
  try {
    await sb("reports", { method: "POST", body: reportRow });
  } catch (e) {
    if (!/23505|duplicate/i.test(String(e.message || ""))) throw e;
  }

  const mpatch = { status: "done", end_time: new Date().toISOString(), status_synced_at: new Date().toISOString() };
  if (participants.length) mpatch.participants = participants.map((p) => p.name);
  if (dur) mpatch.duration_min = dur;
  if (bot && bot.recordings && bot.recordings[0]) mpatch.recording_id = bot.recordings[0].id;
  await sb(`meetings?id=eq.${meeting.id}`, { method: "PATCH", body: mpatch });

  // Post-meeting: write the score + report link into the real Google Calendar event.
  if (meeting.calendar_event_id) {
    const note = `✅ Recorded by OctoMeet AI · Read Score ${sc.overall || 0} · Engagement ${sc.engagement || 0}\n${(ai.summary || "").slice(0, 240)}\nFull report: ${APP_URL}`;
    annotateEvent(meeting.user_id, meeting.calendar_event_id, note).catch(() => {});
  }

  return { ok: true, transcriptChars: tr.text.length, participants: participants.length };
}
