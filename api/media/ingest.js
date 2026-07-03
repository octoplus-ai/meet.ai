// Receives a botless (Meet Media API) capture: the transcript turns + meeting info. Two callers:
//  - the add-on panel posting its live-caption turns directly (session auth), and
//  - the orchestrator's ASR worker calling back with diarized turns for an uploaded recording
//    (BOT_INGEST_SECRET + meetingId, same contract as api/bot/ingest.js).
// Builds the SAME rich AI report the bot paths produce, so the whole app works identically.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { analyzeTranscript, ANALYSIS_VERSION, sanitizeSpeakerMap, notifyParticipants } from "../lib/process.js";

const enc = encodeURIComponent;
const SPK_LABEL = /^Speaker [A-Z]{1,2}$/; // raw diarization labels are not name hints

async function userId(req, body) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const t = bearer || (body && body.token) || parseCookies(req).om_session;
  const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    // Auth: worker/orchestrator secret first (it also uses the Authorization header, so it must
    // never be mistaken for a session token), then the user's session for direct panel posts.
    const SECRET = process.env.BOT_INGEST_SECRET;
    const given = body.secret || req.headers["x-bot-ingest-secret"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const secretAuth = !!(SECRET && given === SECRET && body.meetingId);
    let uid = null, meeting = null;
    if (secretAuth) {
      const rows = await sb(`meetings?id=eq.${enc(body.meetingId)}&select=*`);
      meeting = rows[0];
      if (!meeting) return res.status(404).json({ error: "meeting not found" });
      if (meeting.status === "done") return res.status(200).json({ ok: true, alreadyDone: true, meeting_id: meeting.id });
      uid = meeting.user_id;
    } else {
      uid = await userId(req, body);
      if (!uid) return res.status(401).json({ error: "not authenticated" });
    }

    const turns = Array.isArray(body.turns) ? body.turns : [];
    const meetingCode = body.meetingCode || null;
    const meetingUrl = meetingCode ? `https://meet.google.com/${meetingCode}` : (meeting && meeting.meeting_url) || null;
    const title = body.title || (meeting && meeting.title) || "Live meeting";

    // Reuse only a LIVE row for this URL (a finished meeting on the same recurring link must
    // never be overwritten). The secret path already resolved its row by id above.
    if (!meeting && meetingUrl) {
      const since = new Date(Date.now() - 6 * 3600000).toISOString();
      const ex = await sb(`meetings?user_id=eq.${uid}&meeting_url=eq.${encodeURIComponent(meetingUrl)}&capture_mode=eq.media_api&status=eq.processing&created_at=gte.${encodeURIComponent(since)}&select=*&order=created_at.desc&limit=1`);
      meeting = ex[0];
    }
    if (!meeting) {
      const created = await sb("meetings", {
        method: "POST", prefer: "return=representation",
        body: {
          user_id: uid, title, source: "Meet (botless)", meeting_url: meetingUrl, status: "processing",
          capture_mode: "media_api", start_time: new Date().toISOString(), duration_min: body.durationMin || null,
          calendar_event_id: body.calendarEventId || null,
        },
      });
      meeting = created[0];
    }

    // ASR failed upstream: keep the recording, surface the error, never fabricate a report.
    if (!turns.length && body.asrError) {
      const p = { status: "error", error: "Botless capture: " + String(body.asrError).slice(0, 300), status_synced_at: new Date().toISOString() };
      if (body.recordingUrl) p.recording_url = body.recordingUrl;
      await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: p });
      return res.status(200).json({ ok: false, error: "asr failed" });
    }
    const text = turns.map((t) => `[${t.t || ""}] ${t.speaker || "Speaker"}: ${t.text || ""}`).join("\n").trim();
    if (!text) {
      const p = { status: "error", error: "No speech was captured in this meeting.", status_synced_at: new Date().toISOString() };
      if (body.recordingUrl) p.recording_url = body.recordingUrl;
      if (body.durationMin) p.duration_min = body.durationMin;
      await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: p });
      return res.status(200).json({ ok: false, skipped: "no transcript" });
    }

    // Real-people hints for the speaker-identification pass: request attendees (add-on knows the
    // invite) + the row's calendar attendees + non-label caption speaker names.
    const hintNames = [...new Set([
      ...(Array.isArray(body.attendees) ? body.attendees.map((a) => (typeof a === "string" ? a : a && (a.name || a.email))).filter(Boolean) : []),
      ...(Array.isArray(meeting.attendees) ? meeting.attendees.map((a) => a && (a.name || a.email)).filter(Boolean) : []),
      ...turns.map((t) => t.speaker).filter((n) => n && !SPK_LABEL.test(n)),
    ])];

    const ai = await analyzeTranscript(text, title, hintNames);
    if (!(ai.summary && ai.summary.trim())) {
      await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: { status: "processing", status_synced_at: new Date().toISOString() } });
      return res.status(200).json({ ok: false, skipped: "analysis empty - retry" });
    }

    // Swap diarization labels for the real names the analysis identified, and persist the RENAMED
    // dialog. Omit the stamp entirely when a turn has no time - "[] Name:" breaks the dialog parser.
    const spkMap = sanitizeSpeakerMap(ai.speakerMap);
    turns.forEach((tn) => { if (spkMap[tn.speaker]) tn.speaker = spkMap[tn.speaker]; });
    const finalText = turns.map((t) => `${t.t ? `[${t.t}] ` : ""}${t.speaker || "Speaker"}: ${t.text || ""}`).join("\n").trim();

    // Talk-time per speaker (deterministic) from the renamed turns.
    const byName = {};
    turns.forEach((t) => { const n = t.speaker || "Speaker"; const w = (t.text || "").split(/\s+/).filter(Boolean).length; (byName[n] = byName[n] || { name: n, words: 0 }).words += w; });
    const totalW = Object.values(byName).reduce((a, b) => a + b.words, 0) || 1;
    const aiParts = {}; (ai.participants || []).forEach((p) => { if (p && p.name) aiParts[p.name.toLowerCase()] = p; });
    const participants = Object.values(byName).map((s) => {
      const x = aiParts[s.name.toLowerCase()] || {};
      return { name: s.name, role: x.role || "Participant", talkPct: Math.round((s.words / totalW) * 100), wpm: 0, sentiment: x.sentiment || "Neutral", isHost: !!x.isHost };
    });
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
    // Unique meeting_id dedupes concurrent deliveries (worker retry): losing the race is fine.
    try { await sb("reports", { method: "POST", body: reportRow }); }
    catch (e) { if (!/23505|duplicate/i.test(String(e.message || ""))) throw e; }

    const patch = { status: "done", end_time: new Date().toISOString(), status_synced_at: new Date().toISOString(), participants: participants.map((p) => p.name), capture_mode: "media_api" };
    if (body.durationMin) patch.duration_min = body.durationMin;
    if (body.recordingUrl) patch.recording_url = body.recordingUrl;
    if (body.calendarEventId) patch.calendar_event_id = body.calendarEventId;
    await sb(`meetings?id=eq.${enc(meeting.id)}`, { method: "PATCH", body: patch });

    // Auto-recap email the moment the report lands - same behavior as the bot path.
    await notifyParticipants({ ...meeting, ...patch, id: meeting.id }, ai, reportRow);

    res.status(200).json({ ok: true, meeting_id: meeting.id });
  } catch (e) {
    console.error("media ingest error:", e && (e.stack || e.message || e));
    res.status(500).json({ error: String(e.message || e) });
  }
}
