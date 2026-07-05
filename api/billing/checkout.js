// Create a Stripe Checkout Session for a subscription. Session-required. Prices are defined inline
// (price_data) so no pre-created Stripe Products/Prices are needed - just STRIPE_SECRET_KEY in Vercel.
// Amounts in cents: monthly = the /mo price; annual = the full /yr price (12x the discounted /mo rate).
import { stripe } from "../lib/stripe.js";
import { currentUser } from "../lib/session.js";

export const config = { maxDuration: 30 };

const PLANS = {
  starter:  { name: "OctoMeet Starter",  month: 3600,  year: 34800 },   // $36/mo  ·  $29/mo billed yearly ($348)
  pro:      { name: "OctoMeet Pro",      month: 6100,  year: 58800 },   // $61/mo  ·  $49/mo billed yearly ($588)
  business: { name: "OctoMeet Business", month: 12400, year: 118800 },  // $124/mo ·  $99/mo billed yearly ($1,188)
};

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const user = await currentUser(req).catch(() => null);
  if (!user) { res.status(401).json({ error: "not authorized" }); return; }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const plan = PLANS[body.plan];
  const interval = body.interval === "month" ? "month" : "year";
  const qty = Math.max(1, Math.min(500, parseInt(body.seats, 10) || 1));
  if (!plan) { res.status(400).json({ error: "bad plan" }); return; }

  const origin = `https://${req.headers.host}`;
  try {
    const session = await stripe("checkout/sessions", {
      mode: "subscription",
      customer_email: user.email,
      client_reference_id: user.id,
      allow_promotion_codes: "true",
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancel`,
      line_items: [{
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: plan[interval],
          recurring: { interval },
          product_data: { name: `${plan.name}${qty > 1 ? ` (${qty} seats)` : ""}` },
        },
      }],
      subscription_data: { metadata: { userId: user.id, plan: body.plan, interval } },
      metadata: { userId: user.id, plan: body.plan, interval },
    });
    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
