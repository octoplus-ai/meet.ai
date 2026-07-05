// Minimal raw Stripe API helper (form-encoded POST, no SDK dependency). Uses STRIPE_SECRET_KEY,
// which lives only in the Vercel environment, never in the client.
const KEY = process.env.STRIPE_SECRET_KEY;

// Flatten a nested object into Stripe's bracket form-encoding: a[b][c]=v, line_items[0][price_data]=v.
function encodeForm(obj, prefix, out) {
  out = out || [];
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") encodeForm(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
}

export async function stripe(path, body, method = "POST") {
  if (!KEY) throw new Error("STRIPE_SECRET_KEY not set");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? encodeForm(body).join("&") : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(data && data.error && data.error.message) || JSON.stringify(data)}`);
  return data;
}
