// Stripe webhook: verifies the signature over the RAW body, then reflects the subscription state onto
// app_users.plan. bodyParser is disabled so we can hash the exact bytes Stripe signed.
import crypto from "node:crypto";
import { sb } from "../lib/supa.js";

export const config = { api: { bodyParser: false } };

const enc = encodeURIComponent;
const VALID = new Set(["starter", "pro", "business"]);

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

// Verify Stripe-Signature: sha256 HMAC of `${t}.${rawBody}` equals v1, constant-time.
function verify(raw, sig, secret) {
  if (!sig || !secret) return false;
  const parts = Object.fromEntries(String(sig).split(",").map((p) => p.split("=")));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); } catch { return false; }
}

async function setPlan(uid, fields) {
  if (!uid) return;
  await sb(`app_users?id=eq.${enc(uid)}`, { method: "PATCH", body: fields });
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  let raw;
  try { raw = await rawBody(req); } catch (e) { res.status(400).json({ error: "no body" }); return; }
  if (!verify(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) {
    res.status(400).json({ error: "bad signature" }); return;
  }

  let event;
  try { event = JSON.parse(raw); } catch { res.status(400).json({ error: "bad json" }); return; }
  const obj = (event.data && event.data.object) || {};
  const md = obj.metadata || {};

  try {
    if (event.type === "checkout.session.completed") {
      const uid = obj.client_reference_id || md.userId;
      if (uid && VALID.has(md.plan)) {
        await setPlan(uid, { plan: md.plan, stripe_customer_id: obj.customer || null, stripe_subscription_id: obj.subscription || null });
      }
    } else if (event.type === "customer.subscription.updated") {
      const active = obj.status === "active" || obj.status === "trialing" || obj.status === "past_due";
      if (md.userId && VALID.has(md.plan)) await setPlan(md.userId, { plan: active ? md.plan : "free" });
    } else if (event.type === "customer.subscription.deleted") {
      if (md.userId) await setPlan(md.userId, { plan: "free", stripe_subscription_id: null });
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error("[stripe webhook]", e && e.message);
    res.status(500).json({ error: "handler error" });
  }
}
