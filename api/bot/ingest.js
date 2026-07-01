// In-house bot delivery endpoint. The worker (Fly.io) POSTs the finished diarized transcript +
// the recording URL (R2) here with the shared BOT_INGEST_SECRET. We run the SAME Claude analysis
// the Recall path uses and write a full report - so the whole app works identically, at ~$0.20/h.
// POST { secret, meetingId?|botId?, title?, meetingUrl?, durationMin?, recordingUrl?, turns:[{speaker,text,t}] }
import { sb } from "../lib/supa.js";
import { analyzeTranscript, ANALYSIS_VERSION } from "../lib/process.js";

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
      await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: { status: "error", error: "OctoMeet bot captured no transcript.", status_synced_at: new Date().toISOString() } });
      return res.status(200).json({ ok: false, skipped: "no transcript" });
    }
    const title = body.title || meeting.title || "Meeting";

    // Talk-time per speaker (deterministic) from the diarized turns.
    const byName = {};
    turns.forEach((t) => { const n = t.speaker || "Speaker"; const w = (t.text || "").split(/\s+/).filter(Boolean).length; (byName[n] = byName[n] || { name: n, words: 0 }).words += w; });
    const totalW = Object.values(byName).reduce((a, b) => a + b.words, 0) || 1;
    const names = Object.keys(byName);

    const ai = await analyzeTranscript(text, title, names);
    if (!(ai.summary && ai.summary.trim())) {
      await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: { status: "processing", status_synced_at: new Date().toISOString() } });
      return res.status(200).json({ ok: false, skipped: "analysis empty - retry" });
    }
    const aiParts = {}; (ai.participants || []).forEach((p) => { if (p && p.name) aiParts[p.name.toLowerCase()] = p; });
    const participants = Object.values(byName).map((s) => {
      const x = aiParts[s.name.toLowerCase()] || {};
      return { name: s.name, role: x.role || "Participant", talkPct: Math.round((s.words / totalW) * 100), wpm: 0, sentiment: x.sentiment || "Neutral", isHost: !!x.isHost };
    });
    const sc = ai.scores || {};

    await sb(`reports?meeting_id=eq.${enc(meeting.id)}`, { method: "DELETE" });
    await sb("reports", {
      method: "POST",
      body: {
        meeting_id: meeting.id, user_id: uid,
        summary: ai.summary || "", action_items: ai.actionItems || [], next_steps: ai.nextSteps || [],
        key_questions: ai.keyQuestions || [], topics: ai.topics || [], chapters: ai.chapters || [],
        highlights: ai.highlights || [], coaching: ai.coaching || {}, participants,
        sentiment_timeline: ai.sentimentTimeline || [], sentiment_label: ai.sentimentLabel || "Neutral",
        transcript: text, scores: { overall: sc.overall || 0, engagement: sc.engagement || 0, sentiment: sc.sentiment || 0, balance: sc.balance || 0, clarity: sc.clarity || 0, charisma: sc.charisma || 0 },
        read_score: sc.overall || 0, category: ai.category || null, report_version: ANALYSIS_VERSION,
      },
    });
    const patch = { status: "done", end_time: new Date().toISOString(), status_synced_at: new Date().toISOString(), participants: participants.map((p) => p.name), capture_mode: "inhouse_bot" };
    if (body.durationMin) patch.duration_min = body.durationMin;
    if (body.recordingUrl) patch.recording_url = body.recordingUrl;
    await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: patch });

    res.status(200).json({ ok: true, meeting_id: meeting.id });
  } catch (e) {
    console.error("bot ingest error:", e && (e.stack || e.message || e));
    res.status(500).json({ error: String(e.message || e) });
  }
}
