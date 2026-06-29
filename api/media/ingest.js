// Receives a botless (Meet Media API) capture from the add-on: the live transcript
// turns + meeting info. Builds the SAME rich AI report the Recall path produces, so
// the whole app (reports, detail, KPIs) works identically — just without a bot.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { analyzeTranscript } from "../lib/process.js";

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
    const uid = await userId(req, body);
    if (!uid) return res.status(401).json({ error: "not authenticated" });

    const turns = Array.isArray(body.turns) ? body.turns : [];
    const text = turns.map((t) => `[${t.t || ""}] ${t.speaker || "Speaker"}: ${t.text || ""}`).join("\n").trim();
    const title = body.title || "Live meeting";
    const meetingCode = body.meetingCode || null;
    const meetingUrl = meetingCode ? `https://meet.google.com/${meetingCode}` : null;

    // Talk-time per speaker from the turns (deterministic).
    const byName = {};
    turns.forEach((t) => { const n = t.speaker || "Speaker"; const w = (t.text || "").split(/\s+/).filter(Boolean).length; (byName[n] = byName[n] || { name: n, words: 0 }).words += w; });
    const totalW = Object.values(byName).reduce((a, b) => a + b.words, 0) || 1;
    const names = Object.keys(byName);

    const ai = await analyzeTranscript(text, title, names);
    const aiParts = {}; (ai.participants || []).forEach((p) => { if (p && p.name) aiParts[p.name.toLowerCase()] = p; });
    const participants = Object.values(byName).map((s) => {
      const x = aiParts[s.name.toLowerCase()] || {};
      return { name: s.name, role: x.role || "Participant", talkPct: Math.round((s.words / totalW) * 100), wpm: 0, sentiment: x.sentiment || "Neutral" };
    });
    const sc = ai.scores || {};

    // Upsert the meeting (botless capture).
    let meeting;
    if (meetingCode) {
      const ex = await sb(`meetings?user_id=eq.${uid}&meeting_url=eq.${encodeURIComponent(meetingUrl)}&capture_mode=eq.media_api&select=*&order=created_at.desc&limit=1`);
      meeting = ex[0];
    }
    if (!meeting) {
      const created = await sb("meetings", {
        method: "POST", prefer: "return=representation",
        body: { user_id: uid, title, source: "Meet (botless)", meeting_url: meetingUrl, status: "processing", capture_mode: "media_api", start_time: new Date().toISOString(), duration_min: body.durationMin || null },
      });
      meeting = created[0];
    }

    await sb(`reports?meeting_id=eq.${meeting.id}`, { method: "DELETE" });
    await sb("reports", {
      method: "POST",
      body: {
        meeting_id: meeting.id, user_id: uid,
        summary: ai.summary || "", action_items: ai.actionItems || [], next_steps: ai.nextSteps || [],
        key_questions: ai.keyQuestions || [], topics: ai.topics || [], chapters: ai.chapters || [],
        highlights: ai.highlights || [], coaching: ai.coaching || {}, participants,
        sentiment_timeline: ai.sentimentTimeline || [], sentiment_label: ai.sentimentLabel || "Neutral",
        transcript: text, scores: { overall: sc.overall || 0, engagement: sc.engagement || 0, sentiment: sc.sentiment || 0, balance: sc.balance || 0, clarity: sc.clarity || 0, charisma: sc.charisma || 0 }, read_score: sc.overall || 0,
      },
    });
    await sb(`meetings?id=eq.${meeting.id}`, { method: "PATCH", body: { status: "done", end_time: new Date().toISOString(), participants: participants.map((p) => p.name), duration_min: body.durationMin || meeting.duration_min || null } });

    res.status(200).json({ ok: true, meeting_id: meeting.id });
  } catch (e) {
    console.error("media ingest error:", e && (e.stack || e.message || e));
    res.status(500).json({ error: String(e.message || e) });
  }
}
