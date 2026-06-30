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

// Resolve a per-person share token -> { meeting (raw row + reports), role, email } or null.
// The token gets you in; the ROLE is always read from the DB (never trusted from the URL).
export async function resolveShareToken(token) {
  if (!token) return null;
  const q = encodeURIComponent(JSON.stringify([{ token }]));
  let rows;
  try { rows = await sb(`meetings?shares=cs.${q}&select=*,reports(*)`); } catch (e) { return null; }
  if (!rows || !rows.length) return null;
  const m = rows[0];
  const entry = (m.shares || []).find((s) => s && s.token === token && !s.revoked);
  if (!entry) return null;
  return { meeting: m, role: entry.role === "Editor" ? "Editor" : "Viewer", email: entry.email, magic: entry.magic || null };
}
