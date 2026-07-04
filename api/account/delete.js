// Account deletion (GDPR "right to erasure"). Requires a valid session AND an email-confirmation match,
// then permanently deletes ALL of the user's data across every table (children before parents, FK-safe),
// best-effort revokes their Google OAuth token, kills their sessions, and expires the cookie. Irreversible.
// Uses the service-role client (bypasses RLS). NOTE: the recording VIDEO files in R2 are signed-URL-gated
// and expire; a scheduled R2 lifecycle/cleanup job removes the objects under recordings/<userId>/ (the
// sensitive PII - transcripts, reports, tokens - is erased here immediately).
import { sb } from "../lib/supa.js";
import { currentUser } from "../lib/session.js";

const enc = encodeURIComponent;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  const user = await currentUser(req).catch(() => null);
  if (!user) { res.status(401).json({ error: "not authorized" }); return; }
  const uid = user.id;

  // Guard against accidental / forged deletes: the caller must type their exact email.
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (String(body.confirmEmail || "").trim().toLowerCase() !== String(user.email || "").toLowerCase()) {
    res.status(400).json({ error: "confirm_email_mismatch" }); return;
  }

  try {
    // 0) Best-effort: revoke the Google token so access can't linger after erasure.
    try {
      const tok = await sb(`oauth_tokens?user_id=eq.${enc(uid)}&select=access_token,refresh_token`);
      const t = tok && tok[0] && (tok[0].refresh_token || tok[0].access_token);
      if (t) await fetch(`https://oauth2.googleapis.com/revoke?token=${enc(t)}`, { method: "POST" }).catch(() => {});
    } catch (e) {}

    // 1) share_otps has no user_id - delete the ones tied to this user's meeting share tokens.
    try {
      const mtgs = await sb(`meetings?user_id=eq.${enc(uid)}&select=share_token`);
      const tokens = [...new Set((mtgs || []).map((m) => m.share_token).filter(Boolean))];
      if (tokens.length) await sb(`share_otps?token=in.(${tokens.map(enc).join(",")})`, { method: "DELETE" });
    } catch (e) {}

    // 2) Delete every user-owned row, children before parents (FK-safe).
    await sb(`reports?user_id=eq.${enc(uid)}`, { method: "DELETE" });
    await sb(`meetings?user_id=eq.${enc(uid)}`, { method: "DELETE" });
    await sb(`artifacts?user_id=eq.${enc(uid)}`, { method: "DELETE" });
    await sb(`bot_jobs?user_id=eq.${enc(uid)}`, { method: "DELETE" });
    await sb(`oauth_tokens?user_id=eq.${enc(uid)}`, { method: "DELETE" });
    await sb(`sessions?user_id=eq.${enc(uid)}`, { method: "DELETE" });
    await sb(`app_users?id=eq.${enc(uid)}`, { method: "DELETE" });

    res.setHeader("Set-Cookie", "om_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
