import { authorizedLegacyMedia, streamLegacyMedia } from '../lib/legacy-media.js';

export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
  try {
    const query = new URL(req.url, 'https://local').searchParams;
    const meeting = await authorizedLegacyMedia(req, query.get('meetingId'), query.get('share'));
    if (!meeting) return res.status(401).end();
    await streamLegacyMedia(req, res, meeting, query.get('kind') || 'recording');
  } catch (error) {
    if (res.headersSent) return res.destroy();
    return res.status([400, 404, 416, 502, 503].includes(error.status) ? error.status : 500).end();
  }
}
