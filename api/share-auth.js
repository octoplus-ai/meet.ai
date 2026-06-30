// Google sign-in gate for restricted shared reports (Read.ai style). The visitor proves their
// identity with a Google ID token (Google Identity Services - NO OAuth scopes, so it works for
// any external Google user without app verification). We grant access ONLY if their verified
// Google email matches the email this per-person link was shared with. Email-code (OTP) stays as
// a fallback in share-otp.js.
import { resolveShareToken } from "./lib/share.js";
import { sb } from "./lib/supa.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "540014435995-d8rb5g8a9c4rv82vo4dtak9eoh3e2ufi.apps.googleusercontent.com";
const maskEmail = (e) => { const [u, d] = String(e || "").split("@"); return (u ? u[0] + "•••" : "•••") + "@" + (d || ""); };

export default async function handler(req, res) {
  // GET -> hand the public client id to the front-end so it can init Google Identity Services.
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ clientId: CLIENT_ID });
  }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { token, credential } = body;
    if (!token || !credential) return res.status(400).json({ error: "missing token or credential" });

    const r = await resolveShareToken(token);
    if (!r || !r.email) return res.status(404).json({ error: "invalid link" });
    const invited = String(r.email).toLowerCase();

    // Verify the Google ID token (signature + claims) via Google's tokeninfo endpoint.
    const ti = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    if (!ti.ok) return res.status(401).json({ error: "bad_credential" });
    const claims = await ti.json();
    if (claims.aud !== CLIENT_ID) return res.status(401).json({ error: "wrong_audience" });
    const verified = String(claims.email_verified) === "true";
    const email = String(claims.email || "").toLowerCase();
    if (!email || !verified) return res.status(401).json({ error: "email_unverified" });

    if (email !== invited) {
      // Signed in, but this Google account wasn't the one invited.
      return res.status(403).json({ error: "no_access", account: email, invited: maskEmail(invited) });
    }

    // Remember their real Google name + photo on the share entry, so the owner's "Who has access"
    // list can show the actual profile picture (and a proper name) instead of just the email.
    try {
      const rows = await sb(`meetings?id=eq.${encodeURIComponent(r.meeting.id)}&select=id,shares`);
      const shares = (rows[0] && Array.isArray(rows[0].shares)) ? rows[0].shares : [];
      const i = shares.findIndex((s) => s.token === token);
      if (i >= 0) {
        shares[i] = { ...shares[i], name: shares[i].name || claims.name || "", picture: claims.picture || shares[i].picture || "" };
        await sb(`meetings?id=eq.${encodeURIComponent(r.meeting.id)}`, { method: "PATCH", body: { shares } });
      }
    } catch (e) {}

    res.setHeader("Set-Cookie", `om_v_${token}=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
