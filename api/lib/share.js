// Mint (or reuse) a per-meeting public share token. The token is an unguessable random
// string; anyone with the link can VIEW that one report read-only (no Google login).
import { sb } from "./supa.js";
import { parseCookies, randomToken } from "./session.js";
import { validShareProof } from "./share-proof.js";

export const isRtmsDeleting = meeting => meeting?.capture_mode === 'zoom_rtms' && !!meeting.stage_info?.deletion;

export async function ensureShareToken(meetingId, userId) {
  const rows = await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${userId}&select=id,share_token,capture_mode,stage_info`);
  if (!rows.length || isRtmsDeleting(rows[0])) return null;
  if (rows[0].share_token) return rows[0].share_token;
  const tok = randomToken();
  await sb(`meetings?id=eq.${encodeURIComponent(meetingId)}&user_id=eq.${userId}`, { method: "PATCH", body: { share_token: tok } });
  return tok;
}

// Resolve a per-person share token -> { meeting (raw row + reports), role, email } or null.
// Resolves identity metadata only, NOT authorization. Call authorizedShare for access.
// The ROLE is always read from the DB (never trusted from the URL).
export async function resolveShareToken(token) {
  if (!token) return null;
  const q = encodeURIComponent(JSON.stringify([{ token }]));
  let rows;
  try { rows = await sb(`meetings?shares=cs.${q}&select=*,reports(*)`); } catch (e) { return null; }
  if (!rows || !rows.length) return null;
  const m = rows[0];
  if (isRtmsDeleting(m)) return null;
  const entry = (m.shares || []).find((s) => s && s.token === token && !s.revoked);
  if (!entry) return null;
  return { meeting: m, role: entry.role === "Editor" ? "Editor" : "Viewer", email: entry.email, magic: entry.magic || null };
}

// Every share reader/editor uses the same gate, including saved media and AI
// artifacts. Resolve again on each request so revoked grants stop working.
export async function authorizedShare(req, token, { meetingId, botId, minRole = 'Viewer', allowPublic = true, database = sb, resolveShare = resolveShareToken } = {}) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{24,128}$/.test(token)) return null;
  const scoped = meeting => meeting && (!meetingId || meeting.id === meetingId) && (!botId || meeting.bot_id === botId)
    && !meeting.stage_info?.deletion && meeting.status !== 'skipped';
  const grant = await resolveShare(token);
  if (grant) {
    if (!scoped(grant.meeting) || !grant.email || (minRole === 'Editor' && grant.role !== 'Editor')) return null;
    if (!validShareProof(parseCookies(req)[`om_v_${token}`], token, grant.email)) return null;
    return grant;
  }
  if (!allowPublic || minRole === 'Editor') return null;
  const enc = encodeURIComponent;
  const rows = await database(`meetings?share_token=eq.${enc(token)}${meetingId ? '&id=eq.' + enc(meetingId) : ''}${botId ? '&bot_id=eq.' + enc(botId) : ''}&select=*,reports(*)&limit=1`);
  const meeting = rows?.[0];
  // Never turn a revoked personal grant into a public grant if historical data
  // happened to reuse a token in both places.
  if (Array.isArray(meeting?.shares) && meeting.shares.some(entry => entry?.token === token)) return null;
  return scoped(meeting) && meeting.link_access === 'public' ? { meeting, role: 'Viewer', email: null } : null;
}
