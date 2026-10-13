// Server-only entitlement projection. Call only with an authenticated/stored user row,
// never request-body identity. This grants no login access and never updates billing data.
export function isInternalAccount(user) {
  if (typeof user?.id !== "string" || !user.id.trim() || typeof user.email !== "string") return false;
  const email = user.email.trim().toLowerCase();
  if (!email) return false;
  return String(process.env.APP_INTERNAL_EMAILS || "").split(",")
    .map((entry) => entry.trim().toLowerCase()).filter(Boolean).includes(email);
}

export function effectivePlanForUser(user) {
  return isInternalAccount(user) ? "enterprise" : user?.plan;
}
