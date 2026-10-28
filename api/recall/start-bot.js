// Sends an own bot into a meeting URL (now or scheduled). Thin wrapper over
// the shared scheduleBot helper so manual + auto-join share one code path.
import { sb } from "../lib/supa.js";
import { parseCookies } from "../lib/session.js";
import { scheduleBot } from "../lib/schedule.js";
import { parseMeetingUrl } from "../../shared/meeting-platform.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    // Accept the session token via Authorization: Bearer, body.token, or cookie.
    // (The Meet add-on panel runs in a partitioned iframe where the cookie isn't sent.)
    const auth = req.headers.authorization || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
    const t = bearer || body.token || parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });

    let parsed;
    try { parsed = parseMeetingUrl(body.meetingUrl); }
    catch (error) { return res.status(400).json({ error: error.code === "unsupported_platform" ? error.code : "invalid_meeting_url" }); }

    const result = await scheduleBot(s[0].user_id, {
      meetingUrl: parsed.url, title: body.title, joinAt: body.joinAt,
      calendarEventId: body.calendarEventId, botName: body.botName,
      manualRetry: true,
    });
    if (result.error) return res.status(result.status || 502).json({ error: result.error, platform: result.platform });
    res.status(200).json(result);
  } catch (e) {
    // DB/provider exceptions may include a URL with an embedded meeting passcode.
    res.status(500).json({ error: "bot_start_failed" });
  }
}
