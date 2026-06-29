// Re-analyzes the signed-in user's DONE meetings whose report_version is behind the
// current ANALYSIS_VERSION — using each meeting's ALREADY-STORED transcript (no Recall
// call). This makes every past meeting reflect the latest analysis improvements
// (timestamps, chapter points, charisma, language, term fixes…) WITHOUT re-recording.
// The client calls this on load and loops until remaining = 0.
import { sb } from "./lib/supa.js";
import { parseCookies } from "./lib/session.js";
import { reanalyzeStored, ANALYSIS_VERSION } from "./lib/process.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const t = parseCookies(req).om_session;
    const s = await sb(`sessions?token=eq.${encodeURIComponent(t || "")}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
    if (!s.length) return res.status(401).json({ error: "not authenticated" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ updated: 0, remaining: 0 });
    const uid = s[0].user_id;

    const rows = await sb(`meetings?user_id=eq.${uid}&status=eq.done&select=id,title,reports(report_version)&order=created_at.desc`);
    const stale = rows.filter((m) => {
      const rep = Array.isArray(m.reports) ? m.reports[0] : m.reports;
      return rep && (rep.report_version || 0) < ANALYSIS_VERSION;
    });
    const batch = stale.slice(0, 3); // bounded per call (fits maxDuration); client loops
    let updated = 0;
    for (const m of batch) {
      try { await reanalyzeStored(m); updated++; } catch (e) { console.error("reanalyze failed", m.id, e && (e.message || e)); }
    }
    res.status(200).json({ updated, remaining: Math.max(0, stale.length - batch.length), version: ANALYSIS_VERSION });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
