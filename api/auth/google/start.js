// Step 1 of Google OAuth: redirect the user to Google's consent screen,
// asking for profile + read-only Calendar access.
export default function handler(req, res) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "540014435995-d8rb5g8a9c4rv82vo4dtak9eoh3e2ufi.apps.googleusercontent.com",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "https://meet-ai-three-beige.vercel.app/api/auth/google/callback",
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
    ].join(" "),
  });
  res.writeHead(302, { Location: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
  res.end();
}
