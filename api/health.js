// Diagnostic endpoint: shows which env vars Vercel sees in the LIVE deployment
// (booleans only — never exposes secret values). Open /api/health to verify config.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    env: {
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      RECALL_API_KEY: !!process.env.RECALL_API_KEY,
      RECALL_REGION_URL: process.env.RECALL_REGION_URL || null,
    },
  });
}
