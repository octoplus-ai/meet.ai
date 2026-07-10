// Shared meeting-processing pipeline: pull the transcript + video from Recall,
// run a rich Read.ai-style analysis with Claude, and persist a full report.
import { sb } from "./supa.js";
import { getBot, getTranscript, durationMin } from "./recall.js";
import { annotateEvent, getValidToken } from "./google.js";
import { randomToken } from "./session.js";
import { sendViaGmail, reportEmail, getBotSender } from "./email.js";
import { deliverReport } from "./deliver.js";

const APP_URL = "https://meet.octoplusteam.com/"; // branded domain (same deployment; better email deliverability)
const arr = (x) => (Array.isArray(x) ? x : []);

// Auto-recap: when a report is ready, email everyone involved (calendar attendees + owner)
// from the OWNER's Gmail - unless the owner turned it off in Report Sharing preferences.
// Idempotent via meetings.notified_at. Best-effort; never throws into the pipeline.
export async function notifyParticipants(meeting, ai, rep) {
  try {
    if (meeting.notified_at) return;
    const ownerId = meeting.user_id;
    const u = (await sb(`app_users?id=eq.${ownerId}&select=name,email,sharing_prefs,integrations`))[0] || {};
    const prefs = (u.sharing_prefs && typeof u.sharing_prefs === "object") ? u.sharing_prefs : {};
    const ints = (u.integrations && typeof u.integrations === "object") ? u.integrations : {};
    const token = await getValidToken(ownerId);
    // Resolve the sender BEFORE claiming: if we can't deliver ANYTHING right now (no bot sender,
    // no owner Gmail, no auto-push integration), leave notified_at null so a later retry - after
    // the bot mailbox or the owner's Google reconnects - still sends the recap instead of losing it.
    const bot = await getBotSender();
    const sendToken = (bot && bot.token) || token;
    const sendFrom = (bot && bot.fromAddress) || u.email;
    const hasPush = Object.keys(ints).some((k) => ints[k] && ints[k].autoPush && (ints[k].url || ints[k].token));
    if (!(sendToken && u.email) && !hasPush) return;
    // ATOMIC CLAIM: only ONE run may send the recap. A conditional PATCH (notified_at IS NULL)
    // is resolved atomically by Postgres row-locking, so concurrent processMeeting runs
    // (webhook retry + poll/reprocess) can never double-send. If we don't win, bail.
    const claim = await sb(`meetings?id=eq.${meeting.id}&notified_at=is.null`, { method: "PATCH", body: { notified_at: new Date().toISOString() }, prefer: "return=representation" });
    if (!Array.isArray(claim) || !claim.length) return;
    const title = meeting.title || "Meeting report";
    let whenText = "";
    if (meeting.start_time) { try { whenText = new Date(meeting.start_time).toLocaleString("en-US", { month: "long", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) {} }
    const sharer = u.name || u.email || "OctoMeet";
    let shares = arr(meeting.shares);
    const entryFor = (email) => { let e = shares.find((s) => (s.email || "").toLowerCase() === email); if (!e) { e = { email, role: "Viewer", name: "", token: randomToken(), magic: randomToken() }; shares.push(e); } if (!e.magic) e.magic = randomToken(); return e; };

    // 1) Auto-push the report to connected integrations flagged autoPush (independent of email pref).
    const pushData = { title, summary: ai.summary || "", score: (rep.scores && rep.scores.overall) || 0, actionItems: ai.actionItems || rep.action_items || [], nextSteps: ai.nextSteps || rep.next_steps || [], date: meeting.start_time, link: APP_URL };
    for (const target of Object.keys(ints)) { const cfg = ints[target]; if (cfg && cfg.autoPush && (cfg.url || cfg.token)) { try { const r = await deliverReport(target, cfg, pushData); console.log("auto-push " + target + ": " + (r.ok ? "ok" : r.error)); } catch (e) {} } }

    // 2) Auto-recap email to attendees + owner (only if the pref is on and Gmail is connected).
    let sent = 0;
    let attendeeList = null; // persisted so the app (search, copy-emails, Ask Octo) knows participant emails
    if (meeting.calendar_event_id && token) {
      try {
        const ev = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(meeting.calendar_event_id)}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
        attendeeList = arr(ev && ev.attendees).filter((at) => at && at.email && !at.resource).map((at) => ({ email: String(at.email).toLowerCase(), name: at.displayName || "", response: at.responseStatus || "" }));
      } catch (e) { /* ignore */ }
    }
    // Recipients: autoRecap ON (default) -> calendar attendees + owner; OFF -> owner ONLY (the
    // owner always gets their recap the moment the meeting ends). Sender resolved above.
    if (sendToken && u.email) {
      const recips = new Set([u.email.toLowerCase()]);
      if (prefs.autoRecap !== false) (attendeeList || []).forEach((at) => { if (at.response !== "declined") recips.add(at.email); });
      const to = [...recips].filter((e) => /^[^\s,<>"]+@[^\s,<>"]+\.[^\s,<>"]+$/.test(e));
      for (const email of to) {
        const e = entryFor(email);
        // recall/thumb only resolves for real Recall bot ids - never for the in-house bot.
        const coverUrl = meeting.cover_url || (meeting.bot_id && meeting.capture_mode !== "inhouse_bot" ? APP_URL + "api/recall/thumb?botId=" + encodeURIComponent(meeting.bot_id) + "&share=" + e.token : "");
        const { subject, html, text } = reportEmail({ title, whenText, summary: ai.summary || "", chapters: ai.chapters || [], actionItems: ai.actionItems || rep.action_items || [], viewUrl: APP_URL + "?share=" + e.token, coverUrl, sharerName: sharer, kind: "auto" });
        const r = await sendViaGmail(sendToken, { to: email, subject, html, text, fromName: `${sharer} via OctoMeet AI`, fromAddress: sendFrom, replyTo: u.email });
        if (r.ok) sent++;
      }
    }
    const finalPatch = { shares }; // notified_at already claimed above
    if (attendeeList && attendeeList.length) finalPatch.attendees = attendeeList;
    await sb(`meetings?id=eq.${meeting.id}`, { method: "PATCH", body: finalPatch });
    console.log("post-report actions: " + sent + " recap emails for " + meeting.id);
  } catch (e) { console.error("post-report actions error:", e && (e.message || e)); }
}

// Bump this whenever analyzeTranscript's prompt/output shape improves. Existing reports
// with a lower report_version are re-analyzed automatically (from their STORED transcript,
// no Recall needed) so every past meeting reflects the latest improvements without re-recording.
export const ANALYSIS_VERSION = 10; // v10: richer executive-narrative summary (2-4 paras) - re-analyzes past meetings from stored transcript

// Parse a stored transcript string ("[mm:ss] Name: text" - also tolerates early in-house-bot
// bare-second stamps "[125] Name: text") into {t,text} turns.
function parseStoredTurns(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
    let t = "", rest = line;
    if (m) { t = m[1]; rest = m[2]; }
    else { const bs = line.match(/^\[(\d{1,5})\]\s*(.*)$/); if (bs) { const s = parseInt(bs[1], 10); t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; rest = bs[2]; } }
    const ci = rest.indexOf(":");
    return { t, text: ci > 0 && ci < 40 ? rest.slice(ci + 1).trim() : rest };
  });
}

// ---- Diarization-label -> real-name mapping (from the analysis' speakerMap) ----
const SPK_LABEL = /^Speaker [A-Z]{1,2}$/;
// Keep only sane mappings: label keys like "Speaker A", non-empty STRING values (the model can
// return nested objects - never coerce those), never label->label. Null-prototype so a speaker
// literally named "constructor"/"toString" can't collide with Object.prototype on lookups.
export function sanitizeSpeakerMap(m) {
  const out = Object.create(null);
  if (m && typeof m === "object" && !Array.isArray(m)) {
    for (const k of Object.keys(m)) {
      if (typeof m[k] !== "string") continue;
      const v = m[k].trim();
      if (SPK_LABEL.test(k) && v && v.length <= 60 && !SPK_LABEL.test(v)) out[k] = v;
    }
    // Two DIFFERENT speakers must never collapse into one person: when the model maps two labels
    // to the same name (e.g. owner "Santiago" + guest "Santiago"), keep only the first mapping and
    // leave the later speakers on their diarization label - otherwise their talk-time merges and
    // the participant count comes out wrong (seen in prod: a 2-person meeting showing 1).
    const used = new Set();
    for (const k of Object.keys(out)) {
      const val = out[k].toLowerCase();
      if (used.has(val)) delete out[k]; else used.add(val);
    }
  }
  return out;
}
// Rewrite a stored transcript: normalize bare-second stamps to m:ss and swap diarization labels
// for real names ("[125] Speaker A: hi" -> "[2:05] Santiago: hi"). The rename is anchored to the
// SPEAKER PREFIX (start of line, after the optional stamp) and rebuilt by concatenation - a quoted
// "Speaker X:" inside the spoken text must never be touched, and names with $ can't expand as
// replacement metacharacters. Used by reanalyzeStored so old reports get real dialog + working
// subtitles retroactively.
export function normalizeStoredTranscript(text, map = {}) {
  return String(text || "").split("\n").map((line) => {
    let l = line;
    const bs = l.match(/^\[(\d{1,5})\]\s*(.*)$/);
    if (bs) { const s = parseInt(bs[1], 10); l = `[${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}] ${bs[2]}`; }
    const pm = l.match(/^(\[[^\]]*\]\s*)?(Speaker [A-Z]{1,2}):/);
    if (pm && map[pm[2]]) l = (pm[1] || "") + map[pm[2]] + l.slice((pm[1] || "").length + pm[2].length);
    return l;
  }).join("\n");
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
  "summary": string - the single flowing prose overview that someone who missed the meeting reads to understand the whole session, written in the meeting's own auto-detected language as connected prose (2 to 4 short paragraphs, roughly 120 to 250 words), never bullets, arrays, numbering, or headings, since those belong to the other fields. Lead with the bottom line up front: the meeting's purpose and the one headline outcome. Then walk the 2 to 4 most substantive threads, giving the reasoning behind each (the WHY, not just what was said) and where it landed. Close with the concrete decisions and commitments (with who now owns them) and what stays open, contested, or deferred and why. Complement, never duplicate, the topics, chapters, keyQuestions, actionItems, nextSteps, and highlights fields: weave their causal through-line into one coherent narrative instead of re-listing their contents. Stay strictly specific and neutral, naming the real people, numbers, dates, and decisions actually discussed, with no hype, praise, spin, vague filler, speculation, or invented facts. Separate paragraphs with a blank line. Degrade gracefully: if the transcript is very short, empty, unclear, or off-topic, still return a brief honest best-effort summary of whatever is present rather than leaving it blank or padding it,
  "topics": string[] (3-8 short topic phrases),
  "keyQuestions": [{"q": string, "a": string, "t": string}] (max 6 important questions raised + a suggested answer; t = "mm:ss" or "h:mm:ss" when the question was asked; [] if none),
  "actionItems": [{"owner": string, "task": string, "due": string, "t": string}] (max 10; due "" if unknown; t = timestamp "mm:ss" or "h:mm:ss" in the meeting when this was discussed/agreed, "" if unclear),
  "nextSteps": string[] (2-6 concrete next steps / follow-ups agreed or implied),
  "chapters": [{"title": string, "summary": string, "t": string, "points": string[]}] (3-7 chronological chapters; t = "mm:ss" or "h:mm:ss" start time; summary = 1-2 sentence description; points = 1-4 short key topics/takeaways covered in that chapter),
  "highlights": [{"text": string, "t": string}] (3-6 standout quotes/moments; t = approximate timestamp in the meeting when it happened, format "mm:ss" or "h:mm:ss"),
  "participants": [{"name": string, "role": string, "sentiment": "Positive"|"Neutral"|"Negative"}] (one per distinct speaker),
  "speakerMap": {"Speaker A": "Real Name"} (ONLY when the transcript uses anonymous diarization labels like "Speaker A"/"Speaker B": map each label to that person's REAL name, worked out from the conversation itself - self-introductions, people addressing each other by name, plus the Known participants list. Every mapped name MUST be DIFFERENT: two speakers can never share the same string - if two people share a first name, disambiguate with full names (first + last) from Known participants, and if you cannot tell them apart, map only one and leave the other label unmapped. Include only labels you can identify with reasonable confidence; {} when none apply),
  "coaching": {"strengths": string[] (2-4), "improvements": string[] (2-4), "tips": string[] (2-4)},
  "pitchAnalysis": {"overall": string (2-3 sentences on how compelling/persuasive the overall pitch & messaging was in this meeting), "speakers": [{"name": string, "score": int (0-100 pitch/delivery strength), "worked": string[] (1-3 specific things this speaker did WELL, with brief evidence), "improve": string[] (2-4 specific, actionable ways to sharpen their pitch & delivery), "sayNextTime": string (ONE concrete, rewritten line they could actually say next time to be more persuasive - in the meeting's language)}]} (analyze each speaker who spoke a meaningful amount; skip near-silent speakers),
  "scores": {"overall": int, "engagement": int, "sentiment": int, "balance": int, "clarity": int, "charisma": int} (0-100; overall = meeting quality/Read Score, balance = how evenly people talked, clarity = how clear the communication was, charisma = speaker presence/persuasiveness),
  "sentimentLabel": "Positive"|"Neutral"|"Negative",
  "sentimentTimeline": number[] (8 values from -1 to 1, sentiment across the meeting),
  "category": string (classify the meeting into ONE concise folder category, Title Case, 1-3 words. Prefer one of: "Sales Call", "Sales Strategy", "Customer Success", "Customer Support", "Customer Feedback", "Onboarding", "One-on-One", "Planning Meeting", "Partnership Alignment", "Product Demo", "Job Interview", "Program Interview", "Professional Consultation", "Technical Troubleshooting", "Training", "Educational", "Standup", "Kickoff", "Team Meeting"; if none fits, invent a fitting concise category. This is the meeting TYPE, used to auto-file it into a folder.)
}\n` +
    "Infer speaker names/roles from the transcript. If the transcript is very short or empty, still return the object with best-effort/empty values and low scores. Keep every string concise.\n\n" +
    "SPEAKER NAMES - IMPORTANT: when the transcript uses anonymous diarization labels (Speaker A, Speaker B...), figure out who each one actually IS (see speakerMap above) and use the REAL names - never the raw labels - in EVERY human-readable field: participants, pitchAnalysis.speakers, coaching, keyQuestions, highlights and the summary. Only keep a label for a speaker who genuinely cannot be identified from the conversation.\n\n" +
    "LANGUAGE — CRITICAL: First detect the dominant language actually spoken in the transcript (it can be ANY language). Write EVERY human-readable text value (summary, topics, keyQuestions q & a, actionItems owner/task/due, nextSteps, chapters title/summary, highlights, coaching strengths/improvements/tips, participants role) in THAT SAME language as the meeting. Examples: a Portuguese meeting → the whole report in Portuguese; English → English; Spanish → Spanish; French → French; etc. NEVER translate the content to another language — always match the meeting. " +
    "EXCEPTION — keep these machine-read classification values EXACTLY in English regardless of the meeting language: every \"sentiment\" and the \"sentimentLabel\" must be exactly one of Positive | Neutral | Negative. The JSON keys themselves stay exactly as specified above (in English).\n\n" +
    "TRANSCRIPTION ERRORS: the speech-to-text may mis-hear well-known proper nouns, product names, brands and technical terms (e.g. it may write \"CLOCOD\" for \"Claude Code\", \"Versel\" for \"Vercel\", \"Superbase\" for \"Supabase\", \"chat gpt\" for \"ChatGPT\", \"get hub\" for \"GitHub\"). When the surrounding context makes the intended well-known term obvious, use the CORRECT term in your analysis. Be conservative: only fix clear mishearings of widely-known terms where context strongly supports it; if you are unsure, keep the original. Do NOT alter legitimate but uncommon names, company names, or people's names just because they are unfamiliar.\n\n" +
    "PITCH ANALYSIS - expert rubric: evaluate each speaker's pitch/delivery like a world-class pitch coach and communication expert, grounded in proven best practices: (1) a clear hook and value proposition in the first moments; (2) problem -> solution -> concrete benefit structure; (3) specificity and quantified proof over vague claims; (4) credibility and social proof (ethos), logical reasoning (logos) AND emotional resonance/storytelling (pathos); (5) proactively addressing objections; (6) confident, concise delivery - minimal filler words ('um', 'like', 'you know'), no hedging ('I think maybe', 'sort of'); (7) good pacing (~130-160 wpm), pauses for emphasis, clear signposting; (8) tailoring the message to the audience's priorities; (9) a strong, specific close / call to action. 'worked' = what they already do well (cite brief evidence from the transcript). 'improve' = the highest-leverage, SPECIFIC fixes (not generic advice). 'sayNextTime' = rewrite one of their actual weak lines into a sharper, more persuasive version. Be honest and useful, never flattering filler. Write it in the meeting's language.\n\n" +
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
      // The analysis system prompt is large and identical on every meeting AND every
      // batched re-analysis. Caching it makes the prefill ~90% cheaper and faster on
      // consecutive calls within the cache window. reprocess-stale loops span several
      // minutes (2 re-analyses / 60s call), so a 5-min TTL would lapse mid-batch and pay a
      // cold write each time; a 1h TTL keeps the whole batch (and back-to-back user sessions)
      // hitting the cache. Write is ~2x (vs 1.25x) but reads stay ~0.1x - net win under any
      // real volume, which this workload always has.
      system: [{ type: "text", text: sys, cache_control: { type: "ephemeral", ttl: "1h" } }],
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
  // Meeting-average pace FLOOR so any speaker with words gets a real WPM instead of 0, clamped
  // to a sane 60-260 range. Only true non-speakers (0 words) stay at 0.
  const avgWpm = Math.min(260, Math.max(60, totalSec > 5 ? Math.round(totalWords / (totalSec / 60)) : 140));
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
      wpm: talkMin > 0.1 ? Math.round(s.words / talkMin) : ((s.words || 0) > 0 ? avgWpm : 0),
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
    coaching: { ...(ai.coaching || {}), pitch: ai.pitchAnalysis || null },
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

  // Auto-recap email to everyone involved (owner pref controls it; default ON).
  await notifyParticipants(meeting, ai, reportRow);

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
  // Name hints for the speaker-identification pass: existing report participants + the real
  // people on the calendar invite (names/emails) - this is how "Speaker A" becomes "Santiago".
  const names = [...new Set([
    ...(Array.isArray(rep.participants) ? rep.participants.map((p) => p && p.name).filter(Boolean) : []),
    ...(Array.isArray(meeting.attendees) ? meeting.attendees.map((a) => a && (a.name || a.email)).filter(Boolean) : []),
  ])];
  const ai = await analyzeTranscript(text, meeting.title, names);
  // If the analysis came back empty, keep the existing report but still bump the version
  // so we don't re-try in a loop every poll.
  if (!(ai.summary && ai.summary.trim())) {
    await sb(`reports?meeting_id=eq.${meeting.id}`, { method: "PATCH", body: { report_version: ANALYSIS_VERSION } });
    return { skipped: "analysis empty" };
  }
  assignTimestamps(ai, parseStoredTurns(text)); // accurate per-item timestamps from the stored transcript
  const sc = ai.scores || {};
  // Rewrite the STORED transcript too: swap diarization labels for the real names the analysis
  // identified and normalize bare-second stamps to m:ss - fixes the dialog view + subtitles for
  // meetings recorded before those fixes, not just future ones.
  const spkMap = sanitizeSpeakerMap(ai.speakerMap);
  const newText = normalizeStoredTranscript(text, spkMap);
  const patch = {
    summary: ai.summary || rep.summary || "",
    topics: ai.topics || [], key_questions: ai.keyQuestions || [], action_items: ai.actionItems || [],
    next_steps: ai.nextSteps || [], chapters: ai.chapters || [], highlights: ai.highlights || [],
    coaching: { ...(ai.coaching || {}), pitch: ai.pitchAnalysis || null }, sentiment_timeline: ai.sentimentTimeline || [], sentiment_label: ai.sentimentLabel || "Neutral",
    scores: { overall: sc.overall || 0, engagement: sc.engagement || 0, sentiment: sc.sentiment || 0, balance: sc.balance || 0, clarity: sc.clarity || 0, charisma: sc.charisma || 0 },
    read_score: sc.overall || rep.read_score || 0,
    category: ai.category || rep.category || null,
    report_version: ANALYSIS_VERSION,
  };
  // Rewriting the transcript changes turn boundaries/names -> the cached per-turn subtitle
  // translations no longer line up. Clear them so the next viewing re-translates cleanly.
  if (newText !== text) { patch.transcript = newText; patch.subtitles = {}; }
  // Keep existing per-speaker talk-time; refresh name (via speakerMap) + role/sentiment from the
  // new analysis. Match AI participants by the RENAMED name first (the AI answers in real names).
  if (Array.isArray(rep.participants) && rep.participants.length) {
    const aiP = {}; (ai.participants || []).forEach((p) => { if (p && p.name) aiP[p.name.toLowerCase()] = p; });
    patch.participants = rep.participants.map((p) => {
      const name = spkMap[p.name] || p.name;
      const x = aiP[(name || "").toLowerCase()] || aiP[(p.name || "").toLowerCase()] || {};
      return { ...p, name, role: x.role || p.role, sentiment: x.sentiment || p.sentiment };
    });
    // Meeting card shows meetings.participants (names array) - keep it in sync with the renames.
    if (Object.keys(spkMap).length) {
      sb(`meetings?id=eq.${meeting.id}`, { method: "PATCH", body: { participants: patch.participants.map((p) => p.name) } }).catch(() => {});
    }
  }
  await sb(`reports?meeting_id=eq.${meeting.id}`, { method: "PATCH", body: patch });
  return { ok: true, version: ANALYSIS_VERSION };
}
