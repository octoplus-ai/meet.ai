// Step 2 of Google OAuth: Google redirects back here with a code.
// We exchange it for tokens, upsert the user, store the tokens, create a
// session cookie, and send the user into the app.
import { sb } from "../../lib/supa.js";
import { randomToken } from "../../lib/session.js";
import { resolveShareToken } from "../../lib/share.js";

// Share mode: verify the visitor's Google identity against the per-person share entry and set
// the same om_v_<token> cookie the OTP flow sets. NO app session, NO allowlist - an invited
// external Google user gets access to exactly ONE report, nothing else.
async function handleShare(req, res, shareTok, code, oauthError) {
  const back = (extra) => { res.writeHead(302, { Location: "/?share=" + encodeURIComponent(shareTok) + (extra || "") }); res.end(); };
  try {
    // Silent (prompt=none) attempt not possible right now -> show the gate, no error surfaced.
    if (oauthError || !code) return back("&gate=1");
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
    if (!tok.access_token) return back("&gate=1");
    const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
    const email = String(ui.email || "").toLowerCase();
    const r = await resolveShareToken(shareTok);
    if (!r || !r.email) return back("&gate=1");
    if (!email || email !== String(r.email).toLowerCase()) return back("&gate=1&wrong=" + encodeURIComponent(email || "?"));

    // Enrich the share entry with the real name/photo so the owner's access list shows them.
    try {
      const rows = await sb(`meetings?id=eq.${encodeURIComponent(r.meeting.id)}&select=id,shares`);
      const shares = (rows[0] && Array.isArray(rows[0].shares)) ? rows[0].shares : [];
      const i = shares.findIndex((s) => s && s.token === shareTok);
      if (i >= 0) {
        shares[i] = { ...shares[i], name: shares[i].name || ui.name || "", picture: ui.picture || shares[i].picture || "" };
        await sb(`meetings?id=eq.${encodeURIComponent(r.meeting.id)}`, { method: "PATCH", body: { shares } });
      }
    } catch (e) {}

    res.setHeader("Set-Cookie", `om_v_${shareTok}=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    return back("");
  } catch (e) {
    console.error("share callback error:", e && (e.message || e));
    return back("&gate=1");
  }
}

// Free test access: only these emails get in for now. The bot mailbox logs in ONCE so its Gmail
// tokens land in oauth_tokens - it is the official sender for every outgoing meeting email.
const ALLOWLIST = ["santiago@octoplusteam.com", (process.env.BOT_SENDER_EMAIL || "octomeetnotetaker@gmail.com").toLowerCase()];

export default async function handler(req, res) {
  try {
    const q = new URL(req.url, "http://x").searchParams;
    const code = q.get("code");
    const state = q.get("state") || "";
    if (state.startsWith("share:")) return handleShare(req, res, state.slice(6), code, q.get("error"));
    const isAddon = state === "addon";
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

    // Store/refresh the OAuth tokens. Only write refresh_token when Google actually returns
    // one - a re-consent that omits it must NOT null out the previously stored refresh_token.
    const tokenRow = {
      user_id: user.id,
      provider: "google",
      access_token: tok.access_token,
      scope: tok.scope,
      expiry: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString(),
    };
    if (tok.refresh_token) tokenRow.refresh_token = tok.refresh_token;
    await sb("oauth_tokens?on_conflict=user_id,provider", {
      method: "POST",
      prefer: "resolution=merge-duplicates",
      body: tokenRow,
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
