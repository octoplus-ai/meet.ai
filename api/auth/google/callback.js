// Step 2 of Google OAuth: Google redirects back here with a code.
// We exchange it for tokens, upsert the user, store the tokens, create a
// session cookie, and send the user into the app.
import { sb } from "../../lib/supa.js";
import { randomToken } from "../../lib/session.js";

// Free test access: only this email gets in for now.
const ALLOWLIST = ["santiago@octoplusteam.com"];

export default async function handler(req, res) {
  try {
    const code = new URL(req.url, "http://x").searchParams.get("code");
    if (!code) throw new Error("missing code");

    // Exchange the code for tokens.
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "540014435995-d8rb5g8a9c4rv82vo4dtak9eoh3e2ufi.apps.googleusercontent.com",
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "https://meet-ai-three-beige.vercel.app/api/auth/google/callback",
        grant_type: "authorization_code",
      }),
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error("token exchange failed: " + JSON.stringify(tok));

    // Who is this?
    const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then((r) => r.json());

    if (!ALLOWLIST.includes((ui.email || "").toLowerCase())) {
      res.writeHead(302, { Location: "/?auth_error=" + encodeURIComponent("Access is limited to the test user for now.") });
      return res.end();
    }

    // Upsert the user (free plan).
    const users = await sb("app_users?on_conflict=email", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: { email: ui.email.toLowerCase(), name: ui.name, picture: ui.picture, plan: "free" },
    });
    const user = users[0];

    // Store/refresh the OAuth tokens.
    await sb("oauth_tokens?on_conflict=user_id,provider", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: {
        user_id: user.id,
        provider: "google",
        access_token: tok.access_token,
        refresh_token: tok.refresh_token || null,
        scope: tok.scope,
        expiry: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString(),
      },
    });

    // Create a session.
    const t = randomToken();
    await sb("sessions", {
      method: "POST",
      body: { token: t, user_id: user.id, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() },
    });

    res.setHeader("Set-Cookie", `om_session=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (e) {
    res.writeHead(302, { Location: "/?auth_error=" + encodeURIComponent(String(e.message || e)) });
    res.end();
  }
}
