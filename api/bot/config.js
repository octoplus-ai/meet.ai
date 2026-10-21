// Compatibility endpoint for older workers. Presenter Screen has been retired;
// saved user preferences must never enable a new sidecar capture.

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const SECRET = process.env.BOT_INGEST_SECRET;
    const given = req.headers["x-bot-ingest-secret"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || (req.query && req.query.secret) || "";
    if (!SECRET || given !== SECRET) return res.status(401).json({ error: "unauthorized" });

    const meetingId = (req.query && req.query.meetingId) || "";
    if (!meetingId) return res.status(400).json({ error: "meetingId required" });

    return res.status(200).json({ pipDuringShare: false, pipCorner: "br" });
  } catch (e) {
    return res.status(200).json({ pipDuringShare: false, pipCorner: "br" });
  }
}
