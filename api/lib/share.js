// Mint (or reuse) a per-meeting public share token. The token is an unguessable random
// string; anyone with the link can VIEW that one report read-only (no Google login).
import { sb } from "./supa.js";
import { randomToken } from "./session.js";

export async function ensureShareToken(meetingId, userId) {
  const rows = await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${userId}&select=id,share_token`);
  if (!rows.length) return null;
  if (rows[0].share_token) return rows[0].share_token;
  const tok = randomToken();
  await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${userId}`, { method: "PATCH", body: { share_token: tok } });
  return tok;
}
