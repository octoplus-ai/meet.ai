// Diagnostic: verify the official bot sender end-to-end (secret-auth). Runs the EXACT same
// code path the auto-recap uses (getBotSender -> sendViaGmail) and returns only statuses -
// never tokens. GET /api/bot/email-test?to=<addr> with Authorization: Bearer BOT_INGEST_SECRET.
import { getBotSender, sendViaGmail } from "../lib/email.js";

export default async function handler(req, res) {
  try {
    const SECRET = process.env.BOT_INGEST_SECRET;
    const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!SECRET || given !== SECRET) return res.status(401).json({ error: "unauthorized" });

    const bot = await getBotSender();
    if (!bot) return res.status(200).json({ botConnected: false, hint: "app_users/oauth_tokens row missing or token refresh failed" });

    const to = new URL(req.url, "http://x").searchParams.get("to") || "santiago@octoplusteam.com";
    const r = await sendViaGmail(bot.token, {
      to, subject: "OctoMeet sender test",
      html: "<div style='font-family:Arial'>Test del sender oficial del bot ✅ (diagnóstico - podés ignorar este mail)</div>",
      text: "Test del sender oficial del bot (diagnostico - podes ignorar este mail).",
      fromName: "OctoMeet AI", fromAddress: bot.fromAddress,
    });
    res.status(200).json({ botConnected: true, from: bot.fromAddress, sentTo: to, send: r });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
