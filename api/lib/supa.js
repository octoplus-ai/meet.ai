// Minimal Supabase REST helper (server-side, uses service-role key).
// No external deps — uses global fetch (Node 18+ on Vercel).
import { supabaseOrigin } from './service-url.js';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function sb(path, { method = "GET", body, prefer } = {}) {
  const origin = supabaseOrigin();
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${origin}/rest/v1/${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) {
    // Preserve machine-readable conflict codes without exposing row data, SQL,
    // session tokens or provider diagnostics through callers' error responses.
    const code = typeof data?.code === 'string' && /^[A-Z0-9]{5,12}$/.test(data.code) ? data.code : 'DATABASE_REQUEST_FAILED';
    throw Object.assign(new Error(`Supabase ${res.status}: ${code}`), { code, status: res.status });
  }
  return data;
}
