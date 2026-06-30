// Email a shared report to recipients from the OctoMeet system mailbox (SMTP via
// api/lib/email.js -> GMAIL_NOREPLY_USER/PASS). Each recipient gets THEIR per-person
// role link (?share=<token>). Authorized for the Owner (session) or an Editor (share token).
import { sb } from "./lib/supa.js";
import { parseCookies, randomToken } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";
import { sendMail, reportEmail } from "./lib/email.js";

const APP = "https://meet-ai-three-beige.vercel.app/";
const arr = (x) => (Array.isArray(x) ? x : []);

async function authMeeting(req, meetingId, shareToken) {
  const t = parseCookies(req).om_session;
  if (t) {
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (s.length) {
      const m = await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${s[0].user_id}&select=*,reports(*)`);
      if (m.length) { const su = await sb(`app_users?id=eq.${s[0].user_id}&select=name,email`); return { meeting: m[0], sharer: (su[0] && (su[0].name || su[0].email)) || "Someone" }; }
    }
  }
  if (shareToken) {
    const r = await resolveShareToken(shareToken);
    if (r && r.role === "Editor" && r.meeting.id === meetingId) return { meeting: r.meeting, sharer: r.email || "A teammate" };
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const to = [...new Set((body.to || []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^\s,<>"]+@[^\s,<>"]+\.[^\s,<>"]+$/.test(e)))];
    if (!to.length) return res.status(400).json({ error: "no email recipients" });
    const a = await authMeeting(req, body.meetingId, body.shareToken);
    if (!a) return res.status(401).json({ error: "not authorized" });

    const m = a.meeting;
    const rep = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
    const title = m.title || "a meeting report";
    let whenText = "";
    if (m.start_time) { try { whenText = new Date(m.start_time).toLocaleString("en-US", { month: "long", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) {} }
    const role = body.role === "Editor" ? "Editor" : "Viewer";

    // Ensure every recipient has a per-person share entry + token (idempotent), so the email
    // link carries their role. Persist once after building.
    let shares = arr(m.shares);
    const linkFor = (email) => {
      let e = shares.find((s) => (s.email || "").toLowerCase() === email);
      if (!e) { e = { email, role, name: "", token: randomToken() }; shares.push(e); }
      return APP + "?share=" + e.token;
    };

    let sent = 0;
    for (const email of to) {
      const viewUrl = linkFor(email);
      const { subject, html, text } = reportEmail({
        title, whenText, summary: rep.summary || "", chapters: rep.chapters || [], actionItems: rep.action_items || [],
        viewUrl, sharerName: a.sharer, kind: "share", message: body.message || "",
      });
      const r = await sendMail({ to: email, subject, html, text, fromName: `${a.sharer} via OctoMeet AI` });
      if (r.ok) sent++; else if (r.error === "email_not_configured") return res.status(503).json({ error: "email_not_configured", detail: "Set GMAIL_NOREPLY_USER/PASS in Vercel." });
    }
    try { await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}`, { method: "PATCH", body: { shares } }); } catch (e) {}
    console.log("send-share sent " + sent + "/" + to.length);
    res.status(200).json({ ok: true, sent });
  } catch (e) {
    console.error("send-share unhandled:", e && (e.stack || e.message || e));
    res.status(500).json({ error: String(e.message || e) });
  }
}
