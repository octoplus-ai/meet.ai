// Email a shared report to recipients from the OctoMeet system mailbox (SMTP via
// api/lib/email.js -> GMAIL_NOREPLY_USER/PASS). Each recipient gets THEIR per-person
// role link (?share=<token>). Authorized for the Owner (session) or an Editor (share token).
import { sb } from "./lib/supa.js";
import { parseCookies, randomToken } from "./lib/session.js";
import { resolveShareToken } from "./lib/share.js";
import { reportEmail, sendViaGmail } from "./lib/email.js";
import { getValidToken } from "./lib/google.js";

const APP = "https://meet-ai-three-beige.vercel.app/";
const arr = (x) => (Array.isArray(x) ? x : []);

async function ownerInfo(ownerId) {
  const su = await sb(`app_users?id=eq.${ownerId}&select=name,email`);
  return { name: (su[0] && su[0].name) || "", email: (su[0] && su[0].email) || "" };
}

async function authMeeting(req, meetingId, shareToken) {
  const t = parseCookies(req).om_session;
  if (t) {
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (s.length) {
      const m = await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${s[0].user_id}&select=*,reports(*)`);
      if (m.length) { const o = await ownerInfo(s[0].user_id); return { meeting: m[0], ownerId: s[0].user_id, ownerEmail: o.email, sharer: o.name || o.email || "Someone" }; }
    }
  }
  if (shareToken) {
    const r = await resolveShareToken(shareToken);
    if (r && r.role === "Editor" && r.meeting.id === meetingId) { const o = await ownerInfo(r.meeting.user_id); return { meeting: r.meeting, ownerId: r.meeting.user_id, ownerEmail: o.email, sharer: r.email || o.name || "A teammate" }; }
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

    // Send from the report OWNER's own Gmail (their OAuth token). No app password needed.
    const gToken = await getValidToken(a.ownerId);
    if (!gToken || !a.ownerEmail) return res.status(403).json({ error: "needScope", detail: "Owner must reconnect Google (email permission)." });

    const m = a.meeting;
    const rep = (Array.isArray(m.reports) ? m.reports[0] : m.reports) || {};
    const title = m.title || "a meeting report";
    let whenText = "";
    if (m.start_time) { try { whenText = new Date(m.start_time).toLocaleString("en-US", { month: "long", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) {} }
    const role = body.role === "Editor" ? "Editor" : "Viewer";

    // Ensure every recipient has a per-person share entry + token (idempotent), so the email
    // link carries their role. Persist once after building.
    let shares = arr(m.shares);
    const entryFor = (email) => {
      let e = shares.find((s) => (s.email || "").toLowerCase() === email);
      if (!e) { e = { email, role, name: "", token: randomToken(), magic: randomToken() }; shares.push(e); }
      if (!e.magic) e.magic = randomToken();
      return e;
    };

    let sent = 0, lastErr = "";
    for (const email of to) {
      const e = entryFor(email);
      const viewUrl = APP + "?share=" + e.token;
      const coverUrl = m.bot_id ? APP + "api/recall/thumb?botId=" + encodeURIComponent(m.bot_id) + "&share=" + e.token : "";
      const { subject, html, text } = reportEmail({
        title, whenText, summary: rep.summary || "", chapters: rep.chapters || [], actionItems: rep.action_items || [],
        viewUrl, coverUrl, sharerName: a.sharer, kind: "share", message: body.message || "",
      });
      const r = await sendViaGmail(gToken, { to: email, subject, html, text, fromName: `${a.sharer} via OctoMeet AI`, fromAddress: a.ownerEmail });
      if (r.ok) sent++;
      else { lastErr = r.error || "send failed"; if (r.error === "needScope") return res.status(403).json({ error: "needScope", detail: "Reconnect Google (email permission)." }); }
    }
    try { await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}`, { method: "PATCH", body: { shares } }); } catch (e) {}
    console.log("send-share sent " + sent + "/" + to.length + (lastErr ? " err=" + lastErr : ""));
    if (!sent) return res.status(502).json({ error: "send_failed", detail: lastErr.slice(0, 300) });
    res.status(200).json({ ok: true, sent });
  } catch (e) {
    console.error("send-share unhandled:", e && (e.stack || e.message || e));
    res.status(500).json({ error: String(e.message || e) });
  }
}
