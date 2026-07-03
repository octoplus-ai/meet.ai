// Email-OTP gate for restricted shared reports. The per-person token says WHICH report +
// WHICH email is expected; the OTP proves the visitor controls that email. On success we set
// a short-lived cookie so they don't re-verify each refresh. Code is emailed from the owner's
// Gmail (no app password needed). This is the Read.ai "Restricted access" behaviour.
import { sb } from "./lib/supa.js";
import { resolveShareToken } from "./lib/share.js";
import { getValidToken } from "./lib/google.js";
import { sendViaGmail, getBotSender } from "./lib/email.js";

const enc = encodeURIComponent;
const maskEmail = (e) => { const [u, d] = String(e).split("@"); return (u ? u[0] + "•••" : "•••") + "@" + (d || ""); };

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { token, action } = body;
    if (!token) return res.status(400).json({ error: "no token" });
    const r = await resolveShareToken(token);
    if (!r || !r.email) return res.status(404).json({ error: "invalid link" });
    const email = String(r.email).toLowerCase();
    // Restricted access is STRICT: only the email owner gets in, via the OTP code below.
    // (No magic-link auto-grant - a leaked/forwarded link must still pass the email code.)

    if (action === "request") {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await sb("share_otps", { method: "POST", body: { token, email, code, expires_at } });
      const ownerId = r.meeting.user_id;
      const o = (await sb(`app_users?id=eq.${ownerId}&select=name,email`))[0] || {};
      const bot = await getBotSender();
      const gToken = (bot && bot.token) || await getValidToken(ownerId);
      const fromAddr = (bot && bot.fromAddress) || o.email;
      if (gToken && fromAddr) {
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e1b2e;max-width:460px"><p>Your OctoMeet access code for <b>${(r.meeting.title || "the report").replace(/[<>&]/g, "")}</b>:</p><div style="font-size:30px;font-weight:800;letter-spacing:6px;color:#6d28d9;margin:14px 0">${code}</div><p style="color:#64748b;font-size:13px">It expires in 10 minutes. If you didn't request this, ignore it.</p></div>`;
        await sendViaGmail(gToken, { to: email, subject: `${code} is your OctoMeet access code`, html, text: `Your OctoMeet access code: ${code} (expires in 10 minutes).`, fromName: `${o.name || "OctoMeet"} via OctoMeet AI`, fromAddress: fromAddr, replyTo: o.email });
      }
      return res.status(200).json({ ok: true, emailHint: maskEmail(email) });
    }

    if (action === "verify") {
      const code = String(body.code || "").trim();
      if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "bad code" });
      const rows = await sb(`share_otps?token=eq.${enc(token)}&consumed=eq.false&order=created_at.desc&limit=1`);
      const row = rows[0];
      if (!row) return res.status(401).json({ error: "no_code" });
      if (new Date(row.expires_at) < new Date()) return res.status(401).json({ error: "expired" });
      if ((row.attempts || 0) >= 6) return res.status(429).json({ error: "too_many" });
      if (row.code !== code) { await sb(`share_otps?id=eq.${row.id}`, { method: "PATCH", body: { attempts: (row.attempts || 0) + 1 } }); return res.status(401).json({ error: "wrong_code" }); }
      await sb(`share_otps?id=eq.${row.id}`, { method: "PATCH", body: { consumed: true } });
      res.setHeader("Set-Cookie", `om_v_${token}=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "bad action" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
