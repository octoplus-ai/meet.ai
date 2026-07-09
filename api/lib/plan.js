// Central plan definitions + per-plan enforcement helpers. app_users.plan is set by the Stripe
// webhook (free | starter | pro | business; enterprise/internal handled below). EVERYTHING that
// costs real money or is a paid feature reads its cap/flag from here, so pricing changes live in one
// place. Design rule: gates FAIL OPEN (never block on a lookup error) - a rare over-limit is far
// cheaper than blocking a paying customer mid-meeting.
import { sb } from "./supa.js";

const enc = encodeURIComponent;
const INF = Infinity;

// doc/deck/deck_img = AI generations per calendar month (keys match consumeQuota's `kind`).
// maxMeetingMin = hard meeting-length cap (Free is capped at 60m; paid at the 4h product max).
// recordHoursMonth = monthly recording budget (Infinity = "Unlimited" as shown on every paid plan).
// features = boolean paid-feature gates.
export const PLANS = {
  free:       { doc: 0,   deck: 0,   deck_img: 0,   maxMeetingMin: 60,  recordHoursMonth: 5,   features: {} },
  starter:    { doc: 15,  deck: 10,  deck_img: 10,  maxMeetingMin: 240, recordHoursMonth: INF, features: { dubbing: true, autoJoin: true } },
  pro:        { doc: 40,  deck: 30,  deck_img: 30,  maxMeetingMin: 240, recordHoursMonth: INF, features: { dubbing: true, autoJoin: true, extension: true } },
  business:   { doc: 200, deck: 100, deck_img: 100, maxMeetingMin: 240, recordHoursMonth: INF, features: { dubbing: true, autoJoin: true, extension: true, dashboards: true } },
  enterprise: { doc: INF, deck: INF, deck_img: INF, maxMeetingMin: 240, recordHoursMonth: INF, features: { dubbing: true, autoJoin: true, extension: true, dashboards: true, sso: true } },
};

// Normalize any raw plan string to a known key. "internal"/"unlimited" (our own accounts) = enterprise
// so we never accidentally gate ourselves; anything unknown falls back to the free tier.
export function planKey(plan) {
  const p = String(plan || "free").toLowerCase();
  if (p === "internal" || p === "unlimited") return "enterprise";
  return PLANS[p] ? p : "free";
}

export function limitsForPlan(plan) { return PLANS[planKey(plan)]; }
export function hasFeature(plan, feat) { return !!limitsForPlan(plan).features[feat]; }

// Resolve a user's plan KEY. Returns null ONLY on a real lookup error, so callers can fail open
// (treat null as "don't gate"). A successful lookup with no plan yields "free".
export async function getPlan(userId) {
  try {
    const u = await sb(`app_users?id=eq.${enc(userId)}&select=plan`);
    return planKey(u && u[0] ? u[0].plan : "free");
  } catch (e) { return null; }
}

// Minutes RECORDED this calendar month (done meetings that started this month), for the Free tier's
// monthly recording budget. Best-effort: returns 0 on error so a tracking failure never blocks.
export async function recordedMinutesThisMonth(userId) {
  try {
    const from = new Date(); from.setUTCDate(1); from.setUTCHours(0, 0, 0, 0);
    const rows = await sb(`meetings?user_id=eq.${enc(userId)}&status=eq.done&start_time=gte.${enc(from.toISOString())}&select=duration_min`);
    return (rows || []).reduce((a, r) => a + (r.duration_min || 0), 0);
  } catch (e) { return 0; }
}

// Recording gate used at bot-arming time. Returns { maxMeetingMin, allow, reason }. allow=false only
// when a Free user has spent their monthly recording budget. Fails OPEN on any lookup issue.
export async function recordingGate(userId) {
  const plan = await getPlan(userId);
  if (!plan) return { maxMeetingMin: 240, allow: true }; // lookup failed -> permissive, never block
  const lim = PLANS[plan];
  if (lim.recordHoursMonth === INF) return { maxMeetingMin: lim.maxMeetingMin, allow: true, plan };
  const usedMin = await recordedMinutesThisMonth(userId);
  const allow = usedMin < lim.recordHoursMonth * 60;
  return { maxMeetingMin: lim.maxMeetingMin, allow, plan, usedMin, capMin: lim.recordHoursMonth * 60, reason: allow ? undefined : "monthly recording limit reached" };
}
