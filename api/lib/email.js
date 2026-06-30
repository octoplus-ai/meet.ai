// Central email sender + branded report template. All OctoMeet mail is sent from the
// system mailbox octoplus.aisolutions@gmail.com via Gmail SMTP (app password), shown as
// "<Name> via OctoMeet AI". No per-user OAuth needed.
import nodemailer from "nodemailer";

const APP = "https://meet-ai-three-beige.vercel.app/";
const LOGO = APP + "email-logo.png";
const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

let _t;
function transport() {
  if (_t !== undefined) return _t;
  const user = process.env.GMAIL_NOREPLY_USER;
  const pass = (process.env.GMAIL_NOREPLY_PASS || "").replace(/\s+/g, ""); // Gmail app passwords are shown with spaces; SMTP needs them stripped
  _t = (user && pass) ? nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } }) : null;
  return _t;
}

// Send via the user's OWN Gmail (Gmail API messages.send + their OAuth access token).
// From = the user's address with a friendly display name. No app password needed.
export async function sendViaGmail(token, { to, subject, html, text, fromName, fromAddress }) {
  if (!token) return { ok: false, error: "no_token", needScope: true };
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return { ok: false, error: "no recipients" };
  const b64 = (s) => (Buffer.from(s || "", "utf8").toString("base64").match(/.{1,76}/g) || []).join("\r\n");
  const nm = fromName ? `=?UTF-8?B?${Buffer.from(fromName, "utf8").toString("base64")}?= ` : "";
  const B = "==OctoMeet_b8==";
  const raw = [
    `To: ${list.join(", ")}`,
    `From: ${nm}<${fromAddress}>`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${B}"`, "",
    `--${B}`, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(text),
    `--${B}`, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(html),
    `--${B}--`, "",
  ].join("\r\n");
  const encoded = Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: encoded }) });
    if (!r.ok) { const t = await r.text().catch(() => ""); console.error("[gmail] send failed", r.status, t.slice(0, 300)); return { ok: false, error: (r.status === 403 || r.status === 401) ? "needScope" : "send_failed", detail: t.slice(0, 200) }; }
    return { ok: true };
  } catch (e) { console.error("[gmail] send error", e && e.message); return { ok: false, error: String(e.message || e) }; }
}

export async function sendMail({ to, subject, html, text, fromName, replyTo }) {
  const t = transport();
  const user = process.env.GMAIL_NOREPLY_USER;
  if (!t || !user) { console.error("[email] not configured (GMAIL_NOREPLY_USER/PASS missing)"); return { ok: false, error: "email_not_configured" }; }
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) return { ok: false, error: "no recipients" };
  const from = `"${String(fromName || "OctoMeet AI").replace(/"/g, "")}" <${user}>`;
  try {
    const info = await t.sendMail({ from, to: list.join(", "), subject, html, text, replyTo: replyTo || from });
    return { ok: true, id: info.messageId, sent: list.length };
  } catch (e) {
    console.error("[email] send failed:", e && (e.message || e));
    return { ok: false, error: String(e.message || e) };
  }
}

// Build the branded meeting-report email (used by auto-notify + owner share).
// opts: { title, whenText, summary, chapters:[{title,points:[]}], actionItems:[{task,owner}],
//         viewUrl, sharerName, kind: "auto"|"share" }
export function reportEmail(opts) {
  const title = opts.title || "Meeting report";
  const whenText = opts.whenText || "";
  const viewUrl = opts.viewUrl || APP;
  const summary = opts.summary || "";
  const chapters = Array.isArray(opts.chapters) ? opts.chapters : [];
  const actions = Array.isArray(opts.actionItems) ? opts.actionItems : [];
  const isShare = opts.kind === "share";

  const subject = `📅 ${title}${whenText ? " on " + whenText : ""} | OctoMeet Meeting Report`;
  const sumShort = summary.length > 360 ? esc(summary.slice(0, 360)) + "… " : esc(summary);
  const seeMore = summary.length > 360 ? `<a href="${viewUrl}" style="color:#6d28d9;text-decoration:none">see more</a>` : "";

  const btn = (label, url, solid) => `<a href="${url}" style="display:inline-block;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;${solid ? "background:#6d28d9;color:#ffffff" : "background:#ffffff;color:#6d28d9;border:1px solid #d6ccf5"}">${label}</a>`;

  const chapterRows = chapters.slice(0, 1).map((c) => {
    const pts = (Array.isArray(c.points) ? c.points : []).slice(0, 1).map((p) => `<div style="color:#475569;font-size:13.5px;line-height:1.5;margin:4px 0 0 18px">&bull; ${esc(typeof p === "string" ? p : (p.text || ""))}</div>`).join("");
    return `<div style="color:#1e1b2e;font-size:14px;line-height:1.5">&bull; ${esc(c.title || "")}</div>${pts}`;
  }).join("");
  const actionRows = actions.slice(0, 2).map((a) => `<div style="color:#1e1b2e;font-size:13.5px;line-height:1.55;margin:5px 0">&bull; ${esc(a.task || "")}${a.owner ? ` <span style="color:#7c3aed">(${esc(a.owner)})</span>` : ""}</div>`).join("");

  const html = `<div style="background:#f4f5fa;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ece9f6">
    <tr><td style="padding:26px 32px 4px;text-align:center">
      <img src="${LOGO}" alt="OctoMeet" width="30" height="30" style="vertical-align:middle;border-radius:7px" />
      <span style="font-size:19px;font-weight:800;color:#1e1b2e;vertical-align:middle;margin-left:8px">OctoMeet</span>
    </td></tr>
    <tr><td style="padding:18px 32px 0;text-align:center">
      <div style="font-size:26px;font-weight:800;color:#1e1b2e">${esc(title)}</div>
      ${whenText ? `<div style="font-size:14px;color:#64748b;margin-top:8px">${esc(whenText)}</div>` : ""}
    </td></tr>
    ${opts.message ? `<tr><td style="padding:14px 32px 0"><div style="background:#f5f3ff;border-radius:10px;padding:12px 16px;color:#4c1d95;font-size:14px;line-height:1.5">${esc(opts.message)}</div></td></tr>` : ""}
    <tr><td align="center" style="padding:18px 32px 0">
      <table width="440" cellpadding="0" cellspacing="0" style="max-width:440px;width:100%;border-radius:14px;background-color:#6d28d9;background:linear-gradient(135deg,#A855F7,#6d28d9)"><tr><td align="center" style="padding:42px 20px">
        <div style="width:56px;height:56px;line-height:56px;border-radius:50%;background:rgba(255,255,255,0.22);color:#ffffff;font-size:20px;text-align:center;margin:0 auto">&#9658;</div>
        <div style="color:#ffffff;font-size:14px;font-weight:700;margin-top:12px">${esc(title)}</div>
        <div style="color:#ede9fe;font-size:11px;margin-top:3px">OctoMeet AI &middot; Meeting recording</div>
      </td></tr></table>
    </td></tr>
    ${summary ? `<tr><td style="padding:18px 32px 0;color:#334155;font-size:14.5px;line-height:1.6">${sumShort}${seeMore}</td></tr>` : ""}
    <tr><td align="center" style="padding:22px 32px 8px">
      ${btn("View Report", viewUrl, true)} &nbsp; ${btn(isShare ? "Review notes" : "Share Report", viewUrl, false)}
    </td></tr>
    ${(chapterRows || actionRows) ? `
    <tr><td style="padding:20px 0 0">
      <div style="background-color:#6d28d9;background:linear-gradient(90deg,#6d28d9,#4c1d95);color:#ffffff;font-size:18px;font-weight:700;padding:11px 32px">Recap</div>
    </td></tr>
    <tr><td style="padding:16px 32px 0">
      ${chapterRows ? `<div style="font-size:15px;font-weight:700;color:#1e1b2e;margin-bottom:6px">Chapters &amp; Topics</div>${chapterRows}${chapters.length > 1 ? `<div style="margin-top:8px"><a href="${viewUrl}" style="color:#6d28d9;text-decoration:none;font-size:13.5px">See all ${chapters.length} chapters &rarr;</a></div>` : ""}` : ""}
      ${actionRows ? `<div style="font-size:15px;font-weight:700;color:#1e1b2e;margin:18px 0 4px">Action Items</div>${actionRows}${actions.length > 2 ? `<div style="margin-top:6px"><a href="${viewUrl}" style="color:#6d28d9;text-decoration:none;font-size:13.5px">See all ${actions.length} action items &rarr;</a></div>` : ""}` : ""}
    </td></tr>
    <tr><td align="center" style="padding:20px 32px 26px">${btn(isShare ? "Review notes" : "View Your Action Items", viewUrl, true)}</td></tr>` : ""}
    <tr><td style="padding:16px 32px 26px;text-align:center;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:12px;line-height:1.6">
      ${isShare ? "You are receiving this because someone shared a report with you." : "You are receiving this because you took part in this meeting."}<br>
      OctoMeet AI &middot; Meeting Intelligence
    </td></tr>
  </table>
</div>`;

  const text = [
    `${title}${whenText ? " - " + whenText : ""}`,
    "",
    summary ? summary.slice(0, 600) : "",
    "",
    actions.length ? "Action Items:\n" + actions.slice(0, 5).map((a) => `- ${a.task}${a.owner ? " (" + a.owner + ")" : ""}`).join("\n") : "",
    "",
    "View the report: " + viewUrl,
    "",
    "OctoMeet AI",
  ].filter((x) => x !== "").join("\n");

  return { subject, html, text };
}
