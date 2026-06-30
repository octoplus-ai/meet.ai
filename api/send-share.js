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

    let title = "a meeting report", summary = "";
    if (body.meetingId) {
      const rows = await sb(`meetings?id=eq.${encodeURIComponent(body.meetingId)}&user_id=eq.${id}&select=title,reports(summary)`);
      const m = rows[0];
      if (m) { title = m.title || title; const rep = Array.isArray(m.reports) ? m.reports[0] : m.reports; summary = (rep && rep.summary) || ""; }
    }
    const msg = (body.message || "").trim();
    const subject = `Shared report: ${title}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e1b2e;line-height:1.55;max-width:560px">`
      + (msg ? `<p>${escHtml(msg)}</p>` : "")
      + `<p>A meeting report was shared with you on <b>OctoMeet</b>: <b>${escHtml(title)}</b></p>`
      + (summary ? `<p style="color:#475569">${escHtml(summary).slice(0, 600)}</p>` : "")
      + `<p style="margin:18px 0"><a href="${APP}" style="display:inline-block;background:#6d28d9;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">View the report</a></p>`
      + `<p style="color:#94a3b8;font-size:12px">Shared via OctoMeet</p></div>`;

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
