// Serverless proxy for the app's CLIENT-SIDE Claude calls (Ask Octo chat, uploaded-report parsing).
// It attaches the API key server-side. HARDENED: this proxy spends real money, so it now REQUIRES a
// valid app session, rate-limits per user, and caps the model + max_tokens. It used to be wide open -
// anyone could POST and burn the account's Claude credits with any model / any output size.
import { parseCookies } from "./lib/session.js";
import { sb } from "./lib/supa.js";

const enc = encodeURIComponent;

// Only the (cheaper) models the app uses client-side. A caller can't proxy a pricey model through us;
// an unknown model is coerced to the default rather than rejected, so a future UI change can't break.
const ALLOWED_MODELS = new Set(["claude-sonnet-4-6", "claude-sonnet-5", "claude-haiku-4-5", "claude-haiku-4-5-20251001"]);
const MAX_TOKENS_CEIL = 8000;

// Best-effort in-memory sliding-window rate limit (per warm lambda instance). The session requirement
// is the real gate; this caps a single compromised/abusive logged-in user. Keyed by user id.
const RL_WINDOW_MS = 60 * 1000, RL_MAX = 40;
const hits = new Map(); // userId -> timestamps[]
function rateLimited(userId, now) {
  const arr = (hits.get(userId) || []).filter((t) => now - t < RL_WINDOW_MS);
  arr.push(now);
  hits.set(userId, arr);
  if (hits.size > 5000) hits.clear(); // crude memory bound for a long-lived instance
  return arr.length > RL_MAX;
}

async function sessionUserId(req) {
  const t = parseCookies(req).om_session;
  if (!t) return null;
  const s = await sb(`sessions?token=eq.${enc(t)}&expires_at=gt.${enc(new Date().toISOString())}&select=user_id`);
  return s.length ? s[0].user_id : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "Falta ANTHROPIC_API_KEY en las variables de entorno de Vercel" }); return; }

  // AUTH: a valid app session is required - this endpoint spends money on every call.
  let userId = null;
  try { userId = await sessionUserId(req); } catch (e) { userId = null; }
  if (!userId) { res.status(401).json({ error: "not authorized" }); return; }
  if (rateLimited(userId, Date.now())) { res.status(429).json({ error: "rate_limited" }); return; }

  // Sanitize the passthrough: pin the model to the allowlist and clamp max_tokens so a caller can't
  // request an arbitrarily large / pricey generation.
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const safe = {
    ...body,
    model: ALLOWED_MODELS.has(body.model) ? body.model : "claude-sonnet-4-6",
    max_tokens: Math.min(Number(body.max_tokens) || 3000, MAX_TOKENS_CEIL),
  };

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(safe),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
