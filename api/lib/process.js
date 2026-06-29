// Shared meeting-processing pipeline: pull the transcript + video from Recall,
// run a rich Read.ai-style analysis with Claude, and persist a full report.
import { sb } from "./supa.js";
import { getBot, getTranscript, durationMin } from "./recall.js";
import { annotateEvent } from "./google.js";

const APP_URL = "https://meet-ai-three-beige.vercel.app/";

// Bump this whenever analyzeTranscript's prompt/output shape improves. Existing reports
// with a lower report_version are re-analyzed automatically (from their STORED transcript,
// no Recall needed) so every past meeting reflects the latest improvements without re-recording.
export const ANALYSIS_VERSION = 7;

// Parse a stored transcript string ("[mm:ss] Name: text") into {t,text} turns.
function parseStoredTurns(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
    let t = "", rest = line;
    if (m) { t = m[1]; rest = m[2]; }
    const ci = rest.indexOf(":");
    return { t, text: ci > 0 && ci < 40 ? rest.slice(ci + 1).trim() : rest };
  });
}
const _tok = (s) => (String(s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 3);
// Find the timestamp of the transcript turn that best matches a piece of AI text
// (word overlap). This is how we get ACCURATE, DISTINCT timestamps instead of the
// LLM's unreliable guesses (which often repeat the same time for everything).
function bestTurnTime(text, turns) {
  const set = new Set(_tok(text));
  if (!set.size) return null;
  let best = null, bs = 0;
  for (const tn of turns) {
    if (!tn.t) continue;
    let sc = 0; for (const w of _tok(tn.text)) if (set.has(w)) sc++;
    if (sc > bs) { bs = sc; best = tn; }
  }
  return bs >= 2 && best ? best.t : null;
}
// Override each AI item's timestamp with the real moment it occurs in the transcript.
function assignTimestamps(ai, turns) {
  if (!Array.isArray(turns) || !turns.length || !ai) return ai;
  const fix = (arr, key) => { if (Array.isArray(arr)) arr.forEach((it) => { if (it && typeof it === "object") { const m = bestTurnTime(it[key], turns); if (m) it.t = m; } }); };
  fix(ai.highlights, "text");
  fix(ai.keyQuestions, "q");
  fix(ai.actionItems, "task");
  if (Array.isArray(ai.chapters)) ai.chapters.forEach((c) => { if (c && typeof c === "object") { const m = bestTurnTime((c.title || "") + " " + (c.summary || ""), turns); if (m) c.t = m; } });
  return ai;
}

// Belt-and-suspenders: strip em/en dashes from every string in the AI output (user
// preference: only normal hyphens). Applied to the analysis before it's persisted.
function noDashes(v) {
  if (typeof v === "string") return v.replace(/[—–]/g, "-");
  if (Array.isArray(v)) return v.map(noDashes);
  if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = noDashes(v[k]); return o; }
  return v;
}

// Rich analysis prompt — mirrors Read.ai's report surface.
export async function analyzeTranscript(text, title, participantNames) {
  const sys =
    "You are a meeting-intelligence analyst (like Read.ai). Read the transcript and return ONLY a JSON object (no markdown, no prose) with EXACTLY this shape:\n" +
    `{
  "summary": string (3-5 sentences, neutral, specific),
  "topics": string[] (3-8 short topic phrases),
  "keyQuestions": [{"q": string, "a": string, "t": string}] (max 6 important questions raised + a suggested answer; t = "mm:ss" or "h:mm:ss" when the question was asked; [] if none),
  "actionItems": [{"owner": string, "task": string, "due": string, "t": string}] (max 10; due "" if unknown; t = timestamp "mm:ss" or "h:mm:ss" in the meeting when this was discussed/agreed, "" if unclear),
  "nextSteps": string[] (2-6 concrete next steps / follow-ups agreed or implied),
  "chapters": [{"title": string, "summary": string, "t": string, "points": string[]}] (3-7 chronological chapters; t = "mm:ss" or "h:mm:ss" start time; summary = 1-2 sentence description; points = 1-4 short key topics/takeaways covered in that chapter),
  "highlights": [{"text": string, "t": string}] (3-6 standout quotes/moments; t = approximate timestamp in the meeting when it happened, format "mm:ss" or "h:mm:ss"),
  "participants": [{"name": string, "role": string, "sentiment": "Positive"|"Neutral"|"Negative"}] (one per distinct speaker),
  "coaching": {"strengths": string[] (2-4), "improvements": string[] (2-4), "tips": string[] (2-4)},
  "scores": {"overall": int, "engagement": int, "sentiment": int, "balance": int, "clarity": int, "charisma": int} (0-100; overall = meeting quality/Read Score, balance = how evenly people talked, clarity = how clear the communication was, charisma = speaker presence/persuasiveness),
  "sentimentLabel": "Positive"|"Neutral"|"Negative",
  "sentimentTimeline": number[] (8 values from -1 to 1, sentiment across the meeting),
  "category": string (classify the meeting into ONE concise folder category, Title Case, 1-3 words. Prefer one of: "Sales Call", "Sales Strategy", "Customer Success", "Customer Support", "Customer Feedback", "Onboarding", "One-on-One", "Planning Meeting", "Partnership Alignment", "Product Demo", "Job Interview", "Program Interview", "Professional Consultation", "Technical Troubleshooting", "Training", "Educational", "Standup", "Kickoff", "Team Meeting"; if none fits, invent a fitting concise category. This is the meeting TYPE, used to auto-file it into a folder.)
}\n` +
    "Infer speaker names/roles from the transcript. If the transcript is very short or empty, still return the object with best-effort/empty values and low scores. Keep every string concise.\n\n" +
    "LANGUAGE — CRITICAL: First detect the dominant language actually spoken in the transcript (it can be ANY language). Write EVERY human-readable text value (summary, topics, keyQuestions q & a, actionItems owner/task/due, nextSteps, chapters title/summary, highlights, coaching strengths/improvements/tips, participants role) in THAT SAME language as the meeting. Examples: a Portuguese meeting → the whole report in Portuguese; English → English; Spanish → Spanish; French → French; etc. NEVER translate the content to another language — always match the meeting. " +
    "EXCEPTION — keep these machine-read classification values EXACTLY in English regardless of the meeting language: every \"sentiment\" and the \"sentimentLabel\" must be exactly one of Positive | Neutral | Negative. The JSON keys themselves stay exactly as specified above (in English).\n\n" +
    "TRANSCRIPTION ERRORS: the speech-to-text may mis-hear well-known proper nouns, product names, brands and technical terms (e.g. it may write \"CLOCOD\" for \"Claude Code\", \"Versel\" for \"Vercel\", \"Superbase\" for \"Supabase\", \"chat gpt\" for \"ChatGPT\", \"get hub\" for \"GitHub\"). When the surrounding context makes the intended well-known term obvious, use the CORRECT term in your analysis. Be conservative: only fix clear mishearings of widely-known terms where context strongly supports it; if you are unsure, keep the original. Do NOT alter legitimate but uncommon names, company names, or people's names just because they are unfamiliar.\n\n" +
    "STYLE: NEVER use em dashes (—) or en dashes (–) anywhere in the output. Use a normal hyphen (-) or rewrite the sentence instead.";
  const known = participantNames && participantNames.length ? `Known participants: ${participantNames.join(", ")}.\n\n` : "";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      // Real meetings produce a large JSON report (topics, action items, chapters,
      // timestamped highlights, coaching…). 2500 truncated it mid-JSON → parse failure →
      // empty report. 8000 leaves ample headroom.
      max_tokens: 8000,
      system: sys,
      messages: [{ role: "user", content: `Title: ${title}\n\n${known}Transcript:\n${(text || "(no speech captured)").slice(0, 600000)}` }],
    }),
  });
  const d = await r.json();
  if (d && d.stop_reason === "max_tokens") console.warn("analyzeTranscript: response hit max_tokens — JSON may be truncated");
  let out = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  out = out.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  const a = out.indexOf("{"), b = out.lastIndexOf("}");
  if (a >= 0 && b >= 0) out = out.slice(a, b + 1);
  try { return noDashes(JSON.parse(out)); } catch (e) {
    console.error("analyzeTranscript: JSON parse failed (", String(e.message || e), ") - first 200 chars:", out.slice(0, 200));
    return { summary: "", topics: [], keyQuestions: [], actionItems: [], chapters: [], highlights: [], participants: [], coaching: {}, scores: {}, sentimentLabel: "Neutral", sentimentTimeline: [] };
  }
}

// Merge Claude's per-speaker sentiment with deterministic talk-time stats from the transcript.
function mergeParticipants(stats, aiParts) {
  const totalSec = stats.reduce((s, p) => s + (p.talkSec || 0), 0);
  const totalWords = stats.reduce((s, p) => s + (p.words || 0), 0);
  const haveTime = totalSec > 0;            // word-level timestamps present?
  const denomSec = totalSec || 1;
  const byName = {};
  (aiParts || []).forEach((p) => { if (p && p.name) byName[p.name.toLowerCase()] = p; });
  return stats.map((s) => {
    const ai = byName[(s.name || "").toLowerCase()] || {};
    const talkMin = (s.talkSec || 0) / 60;
    return {
      name: s.name,
      role: ai.role || (s.isHost ? "Host" : "Participant"),
      // Prefer real talk-seconds; when word timestamps are missing, fall back to word share
      // so Participation/Balance reflect reality instead of collapsing to 0%.
      talkPct: haveTime ? Math.round((s.talkSec / denomSec) * 100) : (totalWords ? Math.round((s.words / totalWords) * 100) : 0),
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
  // If the analysis failed (e.g. truncated/invalid JSON), do NOT persist a blank 0-score
  // report. Keep the meeting in "processing" so the next poll retries cleanly.
  if (!(ai.summary && ai.summary.trim())) {
    await sb(`meetings?id=eq.${meeting.id}`, { method: "PATCH", body: { status: "processing", status_synced_at: new Date().toISOString() } });
    return { skipped: "analysis empty - will retry" };
  }
  assignTimestamps(ai, tr.turns); // accurate per-item timestamps from the transcript
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
    scores: { overall: sc.overall || 0, engagement: sc.engagement || 0, sentiment: sc.sentiment || 0, balance: sc.balance || 0, clarity: sc.clarity || 0, charisma: sc.charisma || 0 },
    read_score: sc.overall || 0,
    category: ai.category || null,
    report_version: ANALYSIS_VERSION,
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

// Re-run analysis on a meeting's ALREADY-STORED transcript (no Recall call) so older reports
// pick up prompt/field improvements (timestamps, chapter points, charisma, language, term
// fixes…). Preserves per-speaker talk-time; refreshes the AI fields + bumps report_version.
export async function reanalyzeStored(meeting) {
  const rows = await sb(`reports?meeting_id=eq.${meeting.id}&select=*`);
  const rep = rows[0];
  const text = rep && rep.transcript ? String(rep.transcript) : "";
  if (!rep || text.trim().length < 40) {
    if (rep) await sb(`reports?meeting_id=eq.${meeting.id}`, { method: "PATCH", body: { report_version: ANALYSIS_VERSION } }); // bump so we don't loop
    return { skipped: "no transcript" };
  }
  const names = Array.isArray(rep.participants) ? rep.participants.map((p) => p && p.name).filter(Boolean) : [];
  const ai = await analyzeTranscript(text, meeting.title, names);
  // If the analysis came back empty, keep the existing report but still bump the version
  // so we don't re-try in a loop every poll.
  if (!(ai.summary && ai.summary.trim())) {
    await sb(`reports?meeting_id=eq.${meeting.id}`, { method: "PATCH", body: { report_version: ANALYSIS_VERSION } });
    return { skipped: "analysis empty" };
  }
  assignTimestamps(ai, parseStoredTurns(text)); // accurate per-item timestamps from the stored transcript
  const sc = ai.scores || {};
  const patch = {
    summary: ai.summary || rep.summary || "",
    topics: ai.topics || [], key_questions: ai.keyQuestions || [], action_items: ai.actionItems || [],
    next_steps: ai.nextSteps || [], chapters: ai.chapters || [], highlights: ai.highlights || [],
    coaching: ai.coaching || {}, sentiment_timeline: ai.sentimentTimeline || [], sentiment_label: ai.sentimentLabel || "Neutral",
    scores: { overall: sc.overall || 0, engagement: sc.engagement || 0, sentiment: sc.sentiment || 0, balance: sc.balance || 0, clarity: sc.clarity || 0, charisma: sc.charisma || 0 },
    read_score: sc.overall || rep.read_score || 0,
    category: ai.category || rep.category || null,
    report_version: ANALYSIS_VERSION,
  };
  // Keep existing per-speaker talk-time; refresh role/sentiment from the new analysis.
  if (Array.isArray(rep.participants) && rep.participants.length) {
    const aiP = {}; (ai.participants || []).forEach((p) => { if (p && p.name) aiP[p.name.toLowerCase()] = p; });
    patch.participants = rep.participants.map((p) => { const x = aiP[(p.name || "").toLowerCase()] || {}; return { ...p, role: x.role || p.role, sentiment: x.sentiment || p.sentiment }; });
  }
  await sb(`reports?meeting_id=eq.${meeting.id}`, { method: "PATCH", body: patch });
  return { ok: true, version: ANALYSIS_VERSION };
}
