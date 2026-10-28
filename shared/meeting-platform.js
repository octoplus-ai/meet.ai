// Shared by the app, orchestrator and recorder. Keep provider recognition independent
// of URL text in descriptions or query strings: meeting links contain private tokens.
const PLATFORMS = Object.freeze(['google_meet', 'zoom', 'teams']);
const LABELS = Object.freeze({ google_meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams' });

function invalid(code = 'invalid_meeting_url') {
  const error = new Error(code);
  error.code = code;
  error.status = 400;
  return error;
}

export function parseMeetingUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 4096 || /[\u0000-\u001f\u007f\\]/.test(raw)) throw invalid();
  let url;
  try { url = new URL(raw.trim()); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw invalid();
  url.hash = '';
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  let platform, meetingId;
  if (host === 'meet.google.com') {
    platform = 'google_meet';
    const match = path.match(/^\/(?:([a-z]{3}-[a-z]{4}-[a-z]{3})|lookup\/([A-Za-z0-9_-]{1,128}))\/?$/);
    if (!match) throw invalid();
    meetingId = match[1] || match[2];
  } else if (host === 'zoom.us' || host.endsWith('.zoom.us') || host === 'zoom.com' || host.endsWith('.zoom.com')) {
    platform = 'zoom';
    const match = path.match(/^\/(?:j\/(\d{9,12})|wc\/(\d{9,12})\/join|wc\/join\/(\d{9,12}))\/?$/);
    if (match) meetingId = match[1] || match[2] || match[3];
    else if (!/^\/my\/[A-Za-z0-9._-]{1,128}\/?$/.test(path)) throw invalid();
  } else if (['teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft'].includes(host)) {
    platform = 'teams';
    const modern = path.match(/^\/meet\/(\d{8,20})\/?$/);
    const legacy = path.match(/^\/l\/meetup-join\/([^/]+)\/0\/?$/);
    if (modern) meetingId = modern[1];
    else if (legacy) {
      let token;
      try { token = decodeURIComponent(legacy[1]); } catch { throw invalid(); }
      if (!/^19:[A-Za-z0-9_+=.:-]+@thread\.(?:v2|tacv2)$/.test(token)) throw invalid();
      meetingId = token;
    } else throw invalid();
  } else throw invalid('unsupported_platform');
  const browserUrl = new URL(url);
  if (platform === 'zoom' && meetingId) browserUrl.pathname = `/wc/${meetingId}/join`;
  // Zoom's pwd and Teams' p are opaque link tokens, not human-entered passcodes.
  return { platform, url: url.href, browserJoinUrl: browserUrl.href, ...(meetingId ? { meetingId } : {}) };
}

export function platformLabel(raw) {
  try { return LABELS[parseMeetingUrl(raw).platform]; } catch { return null; }
}

export function enabledPlatforms(env = {}) {
  const raw = env.BOT_ENABLED_PLATFORMS;
  if (raw == null || String(raw).trim() === '') return new Set(['google_meet']);
  return new Set(String(raw).split(',').map(value => value.trim()).filter(value => PLATFORMS.includes(value)));
}

export function requireEnabledMeeting(raw, env = {}) {
  const parsed = parseMeetingUrl(raw);
  if (!enabledPlatforms(env).has(parsed.platform)) {
    const error = invalid('platform_disabled');
    error.status = 409;
    throw error;
  }
  return parsed;
}

export function meetingLimitMinutes(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.min(120, minutes) : 120;
}

function decodeHtml(text) {
  return text.replace(/&(?:amp|quot|apos|lt|gt|#\d{1,7}|#x[0-9a-f]{1,6});/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    const key = entity.toLowerCase();
    if (named[key]) return named[key];
    const hex = key.startsWith('&#x');
    const point = parseInt(key.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
  });
}

export function extractMeetingUrl(event = {}) {
  const direct = [event.hangoutLink,
    ...(event.conferenceData?.entryPoints || []).filter(entry => entry.entryPointType === 'video').map(entry => entry.uri),
    event.onlineMeeting?.joinUrl, event.onlineMeetingUrl];
  const embedded = [event.location, event.description, event.body?.content]
    .filter(value => typeof value === 'string')
    .flatMap(value => decodeHtml(value.slice(0, 100000)).match(/https:\/\/[^\s<>"']+/gi) || [])
    .map(value => value.replace(/[.,;!?)\]}]+$/, ''));
  for (const candidate of [...direct, ...embedded]) {
    if (typeof candidate !== 'string') continue;
    try { return parseMeetingUrl(decodeHtml(candidate)).url; } catch { /* Try the next actual link. */ }
  }
  return null;
}
