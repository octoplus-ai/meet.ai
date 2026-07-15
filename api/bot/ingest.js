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

    // Talk-time + WPM per speaker from the renamed diarized turns. Each turn carries a start stamp
    // (t = "mm:ss" / "h:mm:ss" / bare seconds); a turn's spoken seconds = gap to the next turn,
    // capped so a long silence before the next speaker can't inflate one speaker's time (which
    // would otherwise crater their wpm). This is what fills the Talking Pace / per-speaker wpm cards.
    const parseT = (t) => {
      if (t == null) return null;
      const s = String(t).trim();
      if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s); // bare seconds
      const m = s.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/); // h:mm:ss or mm:ss
      return m ? (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + parseFloat(m[3]) : null;
    };
    const starts = turns.map((t) => parseT(t.t));
    const meetingSec = body.durationMin ? body.durationMin * 60 : null;
    const haveTimes = starts.some((x) => x != null);
    const byName = {};
    turns.forEach((t, i) => {
      const n = t.speaker || "Speaker";
      const w = (t.text || "").split(/\s+/).filter(Boolean).length;
      const rec = (byName[n] = byName[n] || { name: n, words: 0, secs: 0 });
      rec.words += w;
      const st = starts[i];
      if (st == null || !w) return;
      let nx = null;
      for (let j = i + 1; j < turns.length; j++) { if (starts[j] != null) { nx = starts[j]; break; } }
      if (nx == null && meetingSec) nx = meetingSec;
      let dur = (nx != null && nx > st) ? nx - st : 0;
      const maxDur = Math.max(1, w / 1.8), minDur = Math.max(0.3, w / 5); // ~108-300 wpm bounds
      if (!dur || dur > maxDur) dur = maxDur; else if (dur < minDur) dur = minDur;
      rec.secs += dur;
    });
    const totalW = Object.values(byName).reduce((a, b) => a + b.words, 0) || 1;
    const totalSecs = Object.values(byName).reduce((a, b) => a + b.secs, 0);
    // Meeting-average pace FLOOR so EVERY speaker who spoke gets a real WPM (never 0): use measured
    // speech time when we have it, else the meeting duration, else a normal spoken-language default,
    // clamped to a sane 60-260 range. A short or stamp-less turn used to collapse a real speaker to 0.
    const fallbackWpm = Math.min(260, Math.max(60,
      totalSecs > 5 ? Math.round(totalW / (totalSecs / 60))
      : (body.durationMin ? Math.round(totalW / body.durationMin) : 140)));
    const aiParts = {}; (ai.participants || []).forEach((p) => { if (p && p.name) aiParts[p.name.toLowerCase()] = p; });
    const participants = Object.values(byName).map((s) => {
      const x = aiParts[s.name.toLowerCase()] || {};
      const min = s.secs / 60;
      const wpm = min > 0.1 ? Math.round(s.words / min) : (s.words > 0 ? fallbackWpm : 0);
      return { name: s.name, role: x.role || "Participant", talkPct: Math.round((s.words / totalW) * 100), wpm, sentiment: x.sentiment || "Neutral", isHost: !!x.isHost };
    });
    // Roster members with no diarized voice of their own (never spoke, or shared a mic) still
    // COUNT as participants - like Read.ai, guests = who was in the call. De-dup against the mapped
    // speakers so "Santiago" (roster) doesn't duplicate "Santiago Llorach" (speaker) - but ONLY when
    // it is CLEARLY the same person. The old `a.includes(b)` substring test dropped a real second
    // person whose name was a substring of another ("Ana" swallowed by "Anabel", "Sam" by "Samantha"),
    // which then surfaced as a false "Invited - didn't join". Token-aware + conservative: same FIRST
    // token AND the shorter full name is a leading subset of the longer -> same person; otherwise keep.
    const rtok = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[\s,]+/).filter(Boolean);
    const sameRosterPerson = (a, b) => {
      const A = rtok(a), B = rtok(b);
      if (!A.length || !B.length || A[0] !== B[0]) return false; // different first name -> different person
      const short = A.length <= B.length ? A : B, long = A.length <= B.length ? B : A;
      return short.every((t, i) => t === long[i]); // "santiago" vs "santiago llorach" = same; "ana perez" vs "ana gomez" = not
    };
    for (const n of roster) {
      if (participants.some((p) => sameRosterPerson(p.name, n))) continue;
      participants.push({ name: n, role: "Participant", talkPct: 0, wpm: 0, sentiment: "Neutral", isHost: false });
    }
    const sc = ai.scores || {};

    const reportRow = {
      meeting_id: meeting.id, user_id: uid,
      summary: ai.summary || "", action_items: ai.actionItems || [], next_steps: ai.nextSteps || [],
      key_questions: ai.keyQuestions || [], topics: ai.topics || [], chapters: ai.chapters || [],
      highlights: ai.highlights || [], coaching: { ...(ai.coaching || {}), pitch: ai.pitchAnalysis || null, speakerTimeline: Array.isArray(body.speakerTimeline) ? body.speakerTimeline.slice(0, 4000) : [], pipUrl: body.pipUrl || null, shareIntervals: Array.isArray(body.shareIntervals) ? body.shareIntervals.slice(0, 500) : [] }, participants,
      sentiment_timeline: ai.sentimentTimeline || [], sentiment_label: ai.sentimentLabel || "Neutral",
      transcript: finalText, scores: { overall: sc.overall || 0, engagement: sc.engagement || 0, sentiment: sc.sentiment || 0, balance: sc.balance || 0, clarity: sc.clarity || 0, charisma: sc.charisma || 0 },
      read_score: sc.overall || 0, category: ai.category || null, report_version: ANALYSIS_VERSION,
    };
    await sb(`reports?meeting_id=eq.${enc(meeting.id)}`, { method: "DELETE" });
    // Unique meeting_id dedupes concurrent deliveries (worker retry + poll): losing the race is fine.
    try { await sb("reports", { method: "POST", body: reportRow }); }
    catch (e) { if (!/23505|duplicate/i.test(String(e.message || ""))) throw e; }
    const patch = { status: "done", end_time: new Date().toISOString(), status_synced_at: new Date().toISOString(), participants: participants.map((p) => p.name), capture_mode: "inhouse_bot" };
    // Queryable stage verification from the worker ({spotlight: true/false}): confirms the
    // active-speaker layout was applied for THIS recording without digging through fly logs.
    if (body.stage && typeof body.stage === "object") { patch.stage_info = body.stage; console.log("stage verification for", meeting.id, JSON.stringify(body.stage)); }
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
