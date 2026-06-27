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
    const isAddon = new URL(req.url, "http://x").searchParams.get("state") === "addon";
    if (!code) throw new Error("missing code");
    if (!process.env.GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_SECRET no está configurada en Vercel");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY no está configurada en Vercel");

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

    console.log("OAuth login attempt for:", ui.email);
    if (!ALLOWLIST.includes((ui.email || "").toLowerCase())) {
      res.writeHead(302, { Location: "/?auth_error=" + encodeURIComponent(`Acceso limitado al usuario de prueba. Entraste con ${ui.email || "?"}; usá santiago@octoplusteam.com.`) });
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
    if (isAddon) {
      // Meet add-on popup: hand the session token back to the add-on panel and close.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#14122e;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">Connecting OctoMeet…<script>
        try { (window.opener||window.parent).postMessage({ type: "octomeet-token", token: ${JSON.stringify(t)} }, "*"); } catch (e) {}
        setTimeout(function(){ try { window.close(); } catch(e){} }, 300);
      </script></body>`);
      return;
    }
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (e) {
    console.error("OAuth callback error:", e && (e.stack || e.message || e));
    res.writeHead(302, { Location: "/?auth_error=" + encodeURIComponent(String(e.message || e)) });
    res.end();
  }
}
