// Diagnostic endpoint: shows which env vars Vercel sees in the LIVE deployment (booleans only —
// never exposes secret values) + a live DeepL connectivity/usage check. Open /api/health.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const out = {
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    env: {
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
      DEEPL_API_KEY: !!process.env.DEEPL_API_KEY,
      RECALL_API_KEY: !!process.env.RECALL_API_KEY,
      RECALL_REGION_URL: process.env.RECALL_REGION_URL || null,
      BOT_INGEST_SECRET: !!process.env.BOT_INGEST_SECRET,
      BOT_ORCHESTRATOR_URL: !!process.env.BOT_ORCHESTRATOR_URL,
    },
  };
  // Live DeepL check: confirms the key works + how close we are to the free monthly allowance.
  const KEY = process.env.DEEPL_API_KEY;
  if (KEY) {
    try {
      const host = KEY.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
      const r = await fetch(host + "/v2/usage", { headers: { Authorization: "DeepL-Auth-Key " + KEY } });
      if (r.ok) {
        const d = await r.json();
        const used = d.character_count || 0, limit = d.character_limit || 0;
        out.deepl = { connected: true, plan: KEY.trim().endsWith(":fx") ? "free" : "pro", used, limit, remaining: Math.max(0, limit - used), pct: limit ? Math.round((used / limit) * 100) : 0 };
      } else {
        out.deepl = { connected: false, status: r.status };
      }
    } catch (e) { out.deepl = { connected: false, error: String(e.message || e) }; }
  } else {
    out.deepl = { connected: false, note: "DEEPL_API_KEY not set" };
  }
  res.status(200).json(out);
}
