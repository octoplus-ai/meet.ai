// "Ask Octo" over the WHOLE corpus, server-side + streaming. Pulls the user's finished meetings
// from Supabase, retrieves the most relevant ones (keyword score), builds grounded context, and
// streams Claude's answer back as plain text. A trailing `<<<OCTO_REFS>>>[...]` line carries the
// cited meeting ids. Keeps transcripts on the server (no giant client payloads / token blowups).
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";

export const config = { maxDuration: 60 }; // streamed answer over the whole corpus can run long

const MODEL = "claude-sonnet-4-6";
const enc = encodeURIComponent;

async function userId(req) {
  const t = parseCookies(req).om_session;
  if (!t) return null;
  const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
}

const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n) : s; };

function buildContext(question, corpus) {
  const kw = String(question).toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const scored = corpus.map((m) => {
    const hay = (m.title + " " + (m.summary || "") + " " + (m.topics || []).join(" ") + " " + (m.transcriptText || "")).toLowerCase();
    return { m, score: kw.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0) };
  });
  const top = new Set(scored.slice().sort((a, b) => b.score - a.score).slice(0, 5).filter((s) => s.score > 0).map((s) => s.m.id));
  return corpus.map((m) => {
    const ai = (m.action_items || []).map((i) => `- [${i.done ? "x" : " "}] ${i.task || ""}${i.owner ? " (" + i.owner + ")" : ""}`).join("\n");
    let block = `### ${m.title} - ${m.dateStr} (${m.source})  [id:${m.id}]\nSummary: ${m.summary || "(none)"}\nRead Score: ${m.score0}.`;
    if (m.people && m.people.length) block += `\nParticipants: ${m.people.join(", ")}`;
    if (m.contacts && m.contacts.length) block += `\nContacts (emails): ${m.contacts.join("; ")}`;
    block += `\nAction items:\n${ai || "(none)"}`;
    if (top.has(m.id) && m.transcriptText) block += `\nTranscript excerpt:\n` + clip(m.transcriptText, 7000);
    return block;
  }).join("\n\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const uid = await userId(req);
    if (!uid) return res.status(401).json({ error: "not authenticated" });
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages.filter((m) => (m.role === "user" || m.role === "assistant") && m.content).slice(-8) : [];
    const question = body.question || (messages.length ? messages[messages.length - 1].content : "");
    if (!question) return res.status(400).json({ error: "no question" });

    // Pull the corpus (finished meetings + their report) for this user.
    const rows = await sb(`meetings?user_id=eq.${uid}&status=eq.done&select=id,title,start_time,created_at,source,meeting_url,participants,shares,attendees,reports(summary,topics,action_items,read_score,scores,transcript,participants)&order=created_at.desc&limit=200`);
    const corpus = (rows || []).map((m) => {
      const r = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
      const tr = r.transcript;
      const transcriptText = Array.isArray(tr) ? tr.map((t) => `${t.speaker || ""}: ${t.text || ""}`).join("\n") : (typeof tr === "string" ? tr : "");
      // Participant names (report participants > meeting participants).
      const people = (Array.isArray(r.participants) ? r.participants : (Array.isArray(m.participants) ? m.participants : []))
        .map((p) => (typeof p === "string" ? p : (p && p.name))).filter(Boolean);
      // Known emails: calendar attendees + people the report was shared with.
      const contacts = [];
      (Array.isArray(m.attendees) ? m.attendees : []).forEach((a) => { const e = typeof a === "string" ? a : (a && a.email); if (e) contacts.push(a.name ? `${a.name} <${e}>` : e); });
      (Array.isArray(m.shares) ? m.shares : []).forEach((s) => { if (s && s.email && !s.revoked) contacts.push(s.name ? `${s.name} <${s.email}>` : s.email); });
      return {
        id: m.id, title: m.title || "Meeting", source: m.source || "Google Meet",
        dateStr: String(m.start_time || m.created_at || "").slice(0, 10),
        summary: r.summary || "", topics: r.topics || [], action_items: r.action_items || [],
        score0: r.read_score || (r.scores && r.scores.overall) || 0, transcriptText,
        people, contacts: [...new Set(contacts)],
      };
    });
    if (!corpus.length) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.write("You don't have any finished meeting reports yet. Once a meeting is processed, I can answer questions across all of them.");
      res.write("\n<<<OCTO_REFS>>>[]");
      return res.end();
    }

    const ctx = buildContext(question, corpus);
    const sys = "You are OctoMeet AI, a meeting-intelligence assistant. Answer ONLY from the meeting data below, across ALL the user's meetings. Be concise, specific and actionable. When you reference a meeting, mention its name. If the answer isn't in the data, say so plainly. Never use em dashes, only hyphens.\n\n=== MEETING DATA ===\n" + ctx;
    const apiMsgs = messages.length ? messages.map((m) => ({ role: m.role, content: String(m.content) })) : [{ role: "user", content: question }];

    const up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: sys, messages: apiMsgs, stream: true }),
    });
    if (!up.ok || !up.body) { const t = await up.text().catch(() => ""); return res.status(502).json({ error: "claude_failed", detail: t.slice(0, 300) }); }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
    if (res.flushHeaders) res.flushHeaders();

    const reader = up.body.getReader();
    const dec = new TextDecoder();
    let full = "", buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const data = s.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try { const ev = JSON.parse(data); if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") { full += ev.delta.text; res.write(ev.delta.text); } } catch (e) {}
      }
    }
    const refs = corpus.filter((m) => m.title && full.toLowerCase().includes(m.title.toLowerCase())).map((m) => m.id);
    res.write("\n<<<OCTO_REFS>>>" + JSON.stringify(refs));
    res.end();
  } catch (e) {
    try { if (!res.headersSent) res.status(500).json({ error: String(e.message || e) }); else { res.write("\n[error] " + String(e.message || e)); res.end(); } } catch (e2) {}
  }
}
