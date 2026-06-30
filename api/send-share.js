// Automatically email a shared report to recipients via the user's own Gmail (Gmail API,
// using the existing Google OAuth token). Free, no third-party service, real delivery.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { getValidToken } from "./lib/google.js";

const APP = "https://meet-ai-three-beige.vercel.app/";
const escHtml = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    const id = s[0].user_id;
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const to = (body.to || []).filter((e) => /.+@.+\..+/.test(e));
    if (!to.length) return res.status(400).json({ error: "no email recipients" });

    const token = await getValidToken(id);
    if (!token) return res.status(400).json({ error: "no_google_token", needScope: true });

    const su = await sb(`app_users?id=eq.${id}&select=name,email`);
    const sharer = (su[0] && (su[0].name || su[0].email)) || "Someone";

    let title = "a meeting report", summary = "", when = "";
    if (body.meetingId) {
      const rows = await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}&user_id=eq.${id}&select=title,start_time,reports(summary)`);
      const m = rows[0];
      if (m) {
        title = m.title || title;
        const rep = Array.isArray(m.reports) ? m.reports[0] : m.reports;
        summary = (rep && rep.summary) || "";
        if (m.start_time) { try { when = new Date(m.start_time).toLocaleString("en-US", { month: "long", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) {} }
      }
    }
    const msg = (body.message || "").trim();
    const role = (body.role || "viewer").toLowerCase();
    const excerpt = summary ? (summary.length > 320 ? escHtml(summary.slice(0, 320)) + "…" : escHtml(summary)) : "";
    const subject = `${title} | ${sharer} shared a meeting report with you`;
    const LOGO = APP + "email-logo.png";

    const html = `<div style="background:#f4f5fa;padding:28px 12px;font-family:Arial,Helvetica,sans-serif">
  <table align="center" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;border:1px solid #ece9f6">
    <tr><td style="padding:26px 32px 6px;text-align:center">
      <img src="${LOGO}" alt="OctoMeet" width="34" height="34" style="vertical-align:middle;border-radius:8px" />
      <span style="font-size:19px;font-weight:800;color:#1e1b2e;vertical-align:middle;margin-left:8px">OctoMeet</span>
    </td></tr>
    <tr><td style="padding:10px 32px 0;color:#1e1b2e;font-size:15px;line-height:1.55">
      <p>Hi there,</p>
      ${msg ? `<p style="color:#334155">${escHtml(msg)}</p>` : ""}
      <p><b>${escHtml(sharer)}</b> gave you ${escHtml(role)} access to a meeting report:<br><a href="${APP}" style="color:#6d28d9;font-weight:600;text-decoration:none">${escHtml(title)}</a>${when ? ` (${escHtml(when.split(" at ")[0])})` : ""}.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ece9f6;border-radius:12px;margin:16px 0"><tr><td style="padding:16px 18px">
        <div style="font-size:16px;font-weight:700;color:#1e1b2e">${escHtml(title)}</div>
        ${when ? `<div style="font-size:13px;color:#94a3b8;margin:3px 0 8px">${escHtml(when)}</div>` : ""}
        ${excerpt ? `<div style="font-size:14px;color:#475569;line-height:1.5">${excerpt}</div>` : ""}
      </td></tr></table>
      <div style="text-align:center;margin:6px 0 22px"><a href="${APP}" style="display:inline-block;background:#6d28d9;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">View Meeting Report</a></div>
    </td></tr>
    <tr><td style="padding:14px 32px 24px;text-align:center;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:12px;line-height:1.6">
      You are receiving this email because someone shared a report with you.<br>
      OctoMeet AI · Meeting Intelligence
    </td></tr>
  </table>
</div>`;

    // RFC 2822 message with an RFC 2047-encoded subject (handles accents) + HTML body.
    const raw = [
      `To: ${to.join(", ")}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      html,
    ].join("\r\n");
    const encoded = Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      const needScope = r.status === 401 || r.status === 403;
      return res.status(needScope ? 403 : 502).json({ error: "send_failed", needScope, detail: (d.error && d.error.message) || String(r.status) });
    }
    res.status(200).json({ ok: true, sent: to.length });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
