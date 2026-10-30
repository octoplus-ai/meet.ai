// Step 1 of Google OAuth: redirect the user to Google's consent screen,
// asking for profile + read-only Calendar access.
// Share mode (?share=<token>): identity-only sign-in for RESTRICTED shared reports. Uses this
// same server-side redirect flow because the redirect_uri is already registered in GCP -
// Google Identity Services (JS) required the domain in "Authorized JavaScript origins" and
// broke with origin_mismatch on the branded domain. &auto=1 adds prompt=none: if the invited
// account is already signed into the browser, the report opens with ZERO clicks.
import { resolveShareToken } from "../../lib/share.js";
import { createGoogleOAuthState, googleRedirectUri, googleRequestOrigin } from '../../lib/google-oauth-state.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); return res.end(); }
  try {
  const q = new URL(req.url, "http://x").searchParams;
  const addon = q.get("addon");
  const shareTok = q.get("share");
  if (['addon', 'share', 'auto'].some(key => q.getAll(key).length > 1) || (addon && shareTok)) throw new Error('invalid_oauth_request');
  if (shareTok && !/^[A-Za-z0-9_-]{24,128}$/.test(shareTok)) throw new Error('invalid_oauth_request');
  const redirectUri = googleRedirectUri();
  const callbackOrigin = new URL(redirectUri).origin;
  // The registered callback currently lives on Vercel. Set its host-only cookie
  // only after moving there; a cookie on the branded host would never reach it.
  if (googleRequestOrigin(req) !== callbackOrigin) {
    const canonical = new URL('/api/auth/google/start', callbackOrigin);
    if (shareTok) canonical.searchParams.set('share', shareTok);
    if (addon) canonical.searchParams.set('addon', '1');
    if (q.get('auto') === '1') canonical.searchParams.set('auto', '1');
    res.writeHead(302, { Location: canonical.href }); return res.end();
  }
  const { state, cookie } = createGoogleOAuthState(shareTok ? { mode: 'share', shareToken: shareTok } : { mode: addon ? 'addon' : 'normal' });
  res.setHeader('Set-Cookie', cookie);

  if (shareTok) {
    const r = await resolveShareToken(shareTok).catch(() => null);
    const auto = q.get("auto") === "1";
    const sp = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "540014435995-d8rb5g8a9c4rv82vo4dtak9eoh3e2ufi.apps.googleusercontent.com",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile", // identity only - no app scopes, works for ANY external Google user
      state,
    });
    if (r && r.email) sp.set("login_hint", r.email); // skip the account picker for the invited account
    sp.set("prompt", auto ? "none" : "select_account"); // none = silent attempt; its errors bounce back to the gate
    res.writeHead(302, { Location: "https://accounts.google.com/o/oauth2/v2/auth?" + sp.toString() });
    return res.end();
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "540014435995-d8rb5g8a9c4rv82vo4dtak9eoh3e2ufi.apps.googleusercontent.com",
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/calendar.readonly",
      // Write access so OctoMeet can annotate events (e.g. "OctoMeet will record"
      // + post-meeting score/report link) inside the user's real Google Calendar.
      "https://www.googleapis.com/auth/calendar.events",
      // Meet Media API (botless capture): read the space + receive conference audio.
      "https://www.googleapis.com/auth/meetings.space.readonly",
      "https://www.googleapis.com/auth/meetings.conference.media.audio.readonly",
      // Send shared-report emails automatically from the user's own Gmail.
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" "),
  });
  if (addon) params.delete("prompt"); // silent re-auth for the add-on once already authorized
  res.writeHead(302, { Location: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
  res.end();
  } catch {
    res.writeHead(302, { Location: '/?auth_error=oauth_start_failed' }); res.end();
  }
}
