// In-house bot delivery endpoint. The worker (Fly.io) POSTs the finished diarized transcript +
// the recording URL (R2) here with the shared BOT_INGEST_SECRET. We run the SAME Claude analysis
// the Recall path uses and write a full report - so the whole app works identically, at ~$0.20/h.
// POST { secret, meetingId?|botId?, title?, meetingUrl?, durationMin?, recordingUrl?, turns:[{speaker,text,t}] }
import { sb } from "../lib/supa.js";
import { analyzeTranscript, ANALYSIS_VERSION, sanitizeSpeakerMap, notifyParticipants } from "../lib/process.js";

const enc = encodeURIComponent;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const SECRET = process.env.BOT_INGEST_SECRET;
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const given = body.secret || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!SECRET || given !== SECRET) return res.status(401).json({ error: "unauthorized" });

    // Locate the meeting row created when the bot was scheduled (by id, our bot_id, or url).
    let rows = [];
    if (body.meetingId) rows = await sb(`meetings?id=eq.${enc(body.meetingId)}&select=*`);
    else if (body.botId) rows = await sb(`meetings?bot_id=eq.${enc(body.botId)}&select=*`);
    else if (body.meetingUrl) rows = await sb(`meetings?meeting_url=eq.${enc(body.meetingUrl)}&status=neq.done&select=*&order=created_at.desc&limit=1`);
    const meeting = rows[0];
    if (!meeting) return res.status(404).json({ error: "meeting not found" });
    if (meeting.status === "done") return res.status(200).json({ ok: true, alreadyDone: true, meeting_id: meeting.id });
    const uid = meeting.user_id;

    const turns = Array.isArray(body.turns) ? body.turns : [];
    const text = turns.map((t) => `[${t.t || ""}] ${t.speaker || "Speaker"}: ${t.text || ""}`).join("\n").trim();
    if (!text) {
      // No speech captured (empty/silent meeting). Still persist the recording + cover so the video
      // isn't lost, and mark the meeting done-but-empty rather than a hard error.
      const p = { status: "error", error: "No speech was captured in this meeting.", capture_mode: "inhouse_bot", status_synced_at: new Date().toISOString() };
      if (body.recordingUrl) p.recording_url = body.recordingUrl;
      if (body.coverUrl) p.cover_url = body.coverUrl;
      if (body.durationMin) p.duration_min = body.durationMin;
      await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: p });
      return res.status(200).json({ ok: false, skipped: "no transcript" });
    }
    const title = body.title || meeting.title || "Meeting";

    // Who actually JOINED the call (People panel + join toasts, scraped by the worker). These are
    // the strongest identity hints (real in-call display names) AND the source of truth for the
    // guest count - two people talking through one mic diarize as ONE voice, but both joined.
    const roster = Array.isArray(body.rosterNames)
      ? [...new Set(body.rosterNames.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()))]
      : [];
    // Real-people hints for the speaker-identification pass: the calendar invite carries the
    // ACTUAL names/emails, which lets the analysis map "Speaker A" -> the real person.
    const hintNames = [...new Set([
      ...roster,
      ...(Array.isArray(meeting.attendees) ? meeting.attendees.map((a) => a && (a.name || a.email)).filter(Boolean) : []),
      ...(Array.isArray(meeting.participants) ? meeting.participants.filter((x) => typeof x === "string") : []),
    ])];

    const ai = await analyzeTranscript(text, title, hintNames);
    if (!(ai.summary && ai.summary.trim())) {
      await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: { status: "processing", status_synced_at: new Date().toISOString() } });
      return res.status(200).json({ ok: false, skipped: "analysis empty - retry" });
    }

    // Swap diarization labels for the real names the analysis identified, and persist the RENAMED
    // dialog - so the transcript view, subtitles and every analysis show real people.
    const spkMap = sanitizeSpeakerMap(ai.speakerMap);
    turns.forEach((tn) => { if (spkMap[tn.speaker]) tn.speaker = spkMap[tn.speaker]; });
    // Omit the stamp entirely when a turn has no time - "[] Name:" would break the dialog parser.
    const finalText = turns.map((t) => `${t.t ? `[${t.t}] ` : ""}${t.speaker || "Speaker"}: ${t.text || ""}`).join("\n").trim();

    // Talk-time per speaker (deterministic) from the renamed diarized turns.
    const byName = {};
    turns.forEach((t) => { const n = t.speaker || "Speaker"; const w = (t.text || "").split(/\s+/).filter(Boolean).length; (byName[n] = byName[n] || { name: n, words: 0 }).words += w; });
    const totalW = Object.values(byName).reduce((a, b) => a + b.words, 0) || 1;
    const aiParts = {}; (ai.participants || []).forEach((p) => { if (p && p.name) aiParts[p.name.toLowerCase()] = p; });
    const participants = Object.values(byName).map((s) => {
      const x = aiParts[s.name.toLowerCase()] || {};
      return { name: s.name, role: x.role || "Participant", talkPct: Math.round((s.words / totalW) * 100), wpm: 0, sentiment: x.sentiment || "Neutral", isHost: !!x.isHost };
    });
    // Roster members with no diarized voice of their own (never spoke, or shared a mic) still
    // COUNT as participants - like Read.ai, guests = who was in the call. Fuzzy match so
    // "Santiago" (roster) doesn't duplicate "Santiago Llorach" (mapped speaker).
    const overlap = (a, b) => a.includes(b) || b.includes(a);
    for (const n of roster) {
      const ln = n.toLowerCase();
      if (participants.some((p) => overlap(p.name.toLowerCase(), ln))) continue;
      participants.push({ name: n, role: "Participant", talkPct: 0, wpm: 0, sentiment: "Neutral", isHost: false });
    }
    const sc = ai.scores || {};

    const reportRow = {
      meeting_id: meeting.id, user_id: uid,
      summary: ai.summary || "", action_items: ai.actionItems || [], next_steps: ai.nextSteps || [],
      key_questions: ai.keyQuestions || [], topics: ai.topics || [], chapters: ai.chapters || [],
      highlights: ai.highlights || [], coaching: { ...(ai.coaching || {}), pitch: ai.pitchAnalysis || null }, participants,
      sentiment_timeline: ai.sentimentTimeline || [], sentiment_label: ai.sentimentLabel || "Neutral",
      transcript: finalText, scores: { overall: sc.overall || 0, engagement: sc.engagement || 0, sentiment: sc.sentiment || 0, balance: sc.balance || 0, clarity: sc.clarity || 0, charisma: sc.charisma || 0 },
      read_score: sc.overall || 0, category: ai.category || null, report_version: ANALYSIS_VERSION,
    };
    await sb(`reports?meeting_id=eq.${enc(meeting.id)}`, { method: "DELETE" });
    // Unique meeting_id dedupes concurrent deliveries (worker retry + poll): losing the race is fine.
    try { await sb("reports", { method: "POST", body: reportRow }); }
    catch (e) { if (!/23505|duplicate/i.test(String(e.message || ""))) throw e; }
    const patch = { status: "done", end_time: new Date().toISOString(), status_synced_at: new Date().toISOString(), participants: participants.map((p) => p.name), capture_mode: "inhouse_bot" };
    if (body.durationMin) patch.duration_min = body.durationMin;
    if (body.recordingUrl) patch.recording_url = body.recordingUrl;
    if (body.coverUrl) patch.cover_url = body.coverUrl; // real frame extracted by the worker -> report + recap email thumbnail
    await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: patch });

    // Auto-recap email THE MOMENT the meeting ends (this path never sent it - only the Recall
    // pipeline did). Recipients: all attendees + owner if the owner's autoRecap pref is on (the
    // default), owner only otherwise. Sender: the bot mailbox when connected. Idempotent
    // (notified_at claim) and best-effort - a mail failure never breaks delivery.
    await notifyParticipants({ ...meeting, ...patch, id: meeting.id }, ai, reportRow);

    res.status(200).json({ ok: true, meeting_id: meeting.id });
  } catch (e) {
    console.error("bot ingest error:", e && (e.stack || e.message || e));
    res.status(500).json({ error: String(e.message || e) });
  }
}
