// Minimal Supabase REST helper (server-side, uses service-role key).
// No external deps — uses global fetch (Node 18+ on Vercel).
const URL = process.env.SUPABASE_URL || "https://xewahhatxhmfjlujitfa.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function sb(path, { method = "GET", body, prefer } = {}) {
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${txt}`);
  return data;
}
