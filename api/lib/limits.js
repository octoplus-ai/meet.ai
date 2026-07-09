// Hidden monthly usage caps + saved-artifact cache for generated docs/decks.
// Limits are NOT shown to users; when exceeded we return a soft error. Generated artifacts are
// stored forever (per user + kind + key) so re-opening is instant and free; only real generation
// (no cache, or explicit regenerate) counts against the cap.
import crypto from "node:crypto";
import { sb } from "./supa.js";
import { PLANS, planKey } from "./plan.js";

const enc = encodeURIComponent;
const monthKey = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

// A stable key for one meeting or a set of meetings (order-independent).
export function artifactKey(ids) {
  const arr = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String).sort();
  if (arr.length === 1) return arr[0];
  return "set_" + crypto.createHash("sha1").update(arr.join(",")).digest("hex").slice(0, 24);
}

export async function getArtifact(userId, kind, akey) {
  try {
    const r = await sb(`artifacts?user_id=eq.${enc(userId)}&kind=eq.${enc(kind)}&akey=eq.${enc(akey)}&select=payload,meta,updated_at&limit=1`);
    return r && r[0] ? r[0] : null;
  } catch (e) { return null; }
}

export async function saveArtifact(userId, kind, akey, payload, meta) {
  try {
    // Upsert (unique on user_id,kind,akey). Delete-then-insert keeps it simple + portable.
    await sb(`artifacts?user_id=eq.${enc(userId)}&kind=eq.${enc(kind)}&akey=eq.${enc(akey)}`, { method: "DELETE" });
    await sb("artifacts", { method: "POST", body: { user_id: userId, kind, akey, payload, meta: meta || {}, updated_at: new Date().toISOString() } });
  } catch (e) { /* best-effort */ }
}

// Returns { ok:true } if under the PLAN's monthly cap for this kind (and increments), or { ok:false }
// if the cap is hit. The cap now comes from the user's plan (plan.js), so Free (doc/deck = 0) is
// blocked and each paid tier gets its own allowance. Reads plan + usage in ONE query.
export async function consumeQuota(userId, kind) {
  try {
    const u = (await sb(`app_users?id=eq.${enc(userId)}&select=plan,usage`))[0] || {};
    const cap = (PLANS[planKey(u.plan)] || PLANS.free)[kind];
    if (cap == null) return { ok: true };        // unknown kind -> not a metered generation
    if (cap === Infinity) return { ok: true, cap }; // unlimited tier -> never track/block
    const usage = (u.usage && typeof u.usage === "object") ? u.usage : {};
    const mk = monthKey();
    const month = (usage[mk] && typeof usage[mk] === "object") ? { ...usage[mk] } : {};
    const used = month[kind] || 0;
    if (used >= cap) return { ok: false, used, cap };
    month[kind] = used + 1;
    usage[mk] = month;
    await sb(`app_users?id=eq.${enc(userId)}`, { method: "PATCH", body: { usage } });
    return { ok: true, used: used + 1, cap };
  } catch (e) { return { ok: true }; } // never block on a tracking error
}
