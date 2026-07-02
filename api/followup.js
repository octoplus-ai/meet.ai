// "Write a follow-up email" - Claude drafts a professional follow-up from the meeting, the user
// reviews it, then sends it from their own Gmail (or copies it). action: "draft" | "send".
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { getValidToken } from "./lib/google.js";
import { sendViaGmail } from "./lib/email.js";

export const config = { maxDuration: 60 }; // Claude draft call needs headroom past the default timeout

const MODEL = "claude-sonnet-4-6";
const enc = encodeURIComponent;
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function ownerMeeting(req, meetingId) {
  const t = parseCookies(req).om_session;
  if (!t || !meetingId) return null;
  const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
  if (!s.length) return null;
  const m = await sb(`meetings?id=eq.${enc(meetingId)}&user_id=eq.${s[0].user_id}&select=*,reports(*)`);
  return m.length ? { meeting: m[0], ownerId: s[0].user_id } : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const a = await ownerMeeting(req, body.meetingId);
    if (!a) return res.status(401).json({ error: "not authorized" });
    const m = a.meeting;

    if (body.action === "send") {
      const token = await getValidToken(a.ownerId);
      const u = (await sb(`app_users?id=eq.${a.ownerId}&select=name,email`))[0] || {};
      if (!token || !u.email) return res.status(403).json({ error: "needScope", detail: "Reconnect Google (email permission)." });
      const to = [...new Set((body.to || []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^\s,<>"]+@[^\s,<>"]+\.[^\s,<>"]+$/.test(e)))];
      if (!to.length) return res.status(400).json({ error: "no recipients" });
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e1b2e;font-size:14.5px;line-height:1.6">${esc(body.body || "").replace(/\n/g, "<br>")}</div>`;
      let sent = 0, lastErr = "";
      for (const email of to) {
        const r = await sendViaGmail(token, { to: email, subject: body.subject || ("Follow-up: " + (m.title || "our meeting")), html, text: body.body || "", fromName: `${u.name || "OctoMeet"} via OctoMeet AI`, fromAddress: u.email });
        if (r.ok) sent++; else lastErr = r.error || "send failed";
      }
      if (!sent) return res.status(502).json({ error: "send_failed", detail: lastErr });
      return res.status(200).json({ ok: true, sent });
    }

    // action: draft
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
    const r = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
    const ai = (r.action_items || []).map((x) => `- ${x.task || ""}${x.owner ? " (" + x.owner + ")" : ""}${x.due ? " [due " + x.due + "]" : ""}`).join("\n");
    const ns = (r.next_steps || []).map((x) => `- ${typeof x === "string" ? x : (x && x.task) || ""}`).join("\n");
    const people = (Array.isArray(r.participants) ? r.participants : (Array.isArray(m.participants) ? m.participants : [])).map((p) => (typeof p === "string" ? p : (p && p.name))).filter(Boolean);
    const u = (await sb(`app_users?id=eq.${a.ownerId}&select=name,email`))[0] || {};
    // Meeting type signal (folder the AI classified it into + report category) drives the style.
    const folders = (Array.isArray(m.folders) && m.folders.length) ? m.folders : (m.folder ? [m.folder] : []);
    const typeHint = [...folders, r.category].filter(Boolean).join(", ");
    const ctx = [
      `Meeting: ${m.title || "Meeting"}`,
      typeHint ? `Meeting type / folder: ${typeHint}` : "",
      (r.topics && r.topics.length) ? `Topics: ${r.topics.join(", ")}` : "",
      people.length ? `Participants: ${people.join(", ")}` : "",
      `Sender: ${u.name || u.email || "The host"}`,
      r.summary ? `Summary: ${r.summary}` : "",
      ai ? `Action items:\n${ai}` : "",
      ns ? `Next steps:\n${ns}` : "",
    ].filter(Boolean).join("\n");
    const sys = `You are the MEETING HOST writing a genuine, HUMAN follow-up email in the first person ("I"/"we"), in the SAME language the meeting was held in. This is NOT a summary, minutes, or recap, and it must NOT sound like a bot. It should read like a thoughtful person who was actually in the room and is personally following up.

FIRST, infer the MEETING TYPE from the "Meeting type / folder", the topics and the content, and adapt the follow-up STYLE to fit it. Pick the ONE that matches:
- Sales / discovery / demo / proposal / negotiation → reinforce the value for THEM, acknowledge a concern or need they raised, and drive to the next step that advances the deal (a call, a proposal, a trial). Confident, not pushy.
- Onboarding / explanatory / training / support → clarify what was covered, confirm they're set, and share/point to the next resource or step. Helpful and reassuring.
- Reminder / logistics → short and to the point: restate the specific commitment, date or action and gently nudge.
- Informative / status / internal update → a crisp confirmation of the key decisions/info and who owns what. Efficient.
- 1:1 / team / people management → personal and supportive; acknowledge the person, align on priorities/next check-in.
- Interview / hiring → warm, thank them, and state the next step in the process + timing.
- If unclear, default to a warm professional follow-up.

Then write it so it feels real:
- Warm, natural, HUMAN tone that matches the type above. First person; address the recipient(s) by name if known.
- Reference 2-3 SPECIFIC things actually discussed (real names, topics, concerns, a point someone made) so it's clearly about THIS conversation, not a template.
- Reinforce momentum and end with ONE clear, low-friction next step or question (a real call to action) appropriate to the type.
- Short and skimmable (~90-150 words). NO "Summary"/"Recap" headings and no robotic bullet dump - at most a tiny list only if it genuinely reads naturally.
- Never invent facts; use only what's in the meeting. Sign off naturally with the sender's first name.

The subject line must be specific and human (e.g. referencing the topic or next step) - never "Meeting Recap" or "Follow-up".
Return ONLY JSON: {"subject":"...","body":"..."} where body is plain text with line breaks (\\n). No markdown, no fences.`;
    const up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, system: sys, messages: [{ role: "user", content: ctx }] }),
    });
    if (!up.ok) { const tx = await up.text().catch(() => ""); return res.status(502).json({ error: "claude_failed", detail: tx.slice(0, 200) }); }
    const data = await up.json();
    let text = (data.content && data.content[0] && data.content[0].text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let draft; try { draft = JSON.parse(text); } catch (e) { const s = text.indexOf("{"), end = text.lastIndexOf("}"); draft = JSON.parse(text.slice(s, end + 1)); }
    // Suggested recipients: calendar attendees + shared people, minus the owner.
    const to = [];
    (Array.isArray(m.attendees) ? m.attendees : []).forEach((x) => { const e = typeof x === "string" ? x : (x && x.email); if (e) to.push(String(e).toLowerCase()); });
    (Array.isArray(m.shares) ? m.shares : []).forEach((s) => { if (s && s.email && !s.revoked) to.push(String(s.email).toLowerCase()); });
    const recipients = [...new Set(to)].filter((e) => e && e !== (u.email || "").toLowerCase());
    return res.status(200).json({ subject: draft.subject || ("Follow-up: " + (m.title || "our meeting")), body: draft.body || "", to: recipients });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
