// Additive camera metadata for the existing worker callback and JSON coaching/stage
// columns. No storage migration, new credentials, or inferred full-meeting coverage.
const STATUSES = new Set(["available", "partial", "disabled", "unavailable", "failed"]);
const CAMERA_STATES = new Set(["camera", "camera_off", "unavailable"]);
const text = (value, max = 160) => typeof value === "string" ? value.slice(0, max) : "";
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function normalizeCameraIntervals(value, duration = 86400) {
  const end = Number.isFinite(duration) && duration > 0 ? Math.min(duration, 86400) : 86400;
  const ranges = (Array.isArray(value) ? value : []).slice(0, 10000)
    .filter((range) => Array.isArray(range) && Number.isFinite(range[0]) && Number.isFinite(range[1]))
    .map(([start, stop]) => [Math.max(0, start), Math.min(end, stop)])
    .filter(([start, stop]) => stop > start).sort((a, b) => a[0] - b[0]);
  const result = [];
  for (const range of ranges) {
    const last = result.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else result.push(range);
  }
  return result;
}

export function cameraMetadata(body = {}) {
  const stage = record(body.stage);
  const nested = record(stage.presenterMedia);
  const source = { ...body, ...nested };
  // durationMin is rounded for display; using it here could delete the final 29s.
  const exactDuration = [stage.videoSec, nested.durationSec, body.durationSec]
    .find((value) => Number.isFinite(value) && value > 0 && value <= 86400);
  const duration = exactDuration ?? 86400;
  const shareIntervals = normalizeCameraIntervals(source.shareIntervals, duration);
  const pipUrl = text(source.pipUrl, 4096) || null;
  const timeline = (events, camera = false) => (Array.isArray(events) ? events : []).slice(0, 20000)
    .filter((event) => event && Number.isFinite(event.t) && event.t >= 0 && event.t <= duration)
    .map((event) => ({ t: event.t, name: text(event.name), ...(camera ? { state: CAMERA_STATES.has(event.state) ? event.state : "unavailable" } : {}) }))
    .sort((a, b) => a.t - b.t);
  const base = { pipUrl, shareIntervals, speakerTimeline: timeline(source.speakerTimeline) };
  // Preserve the distinction: legacy camera files were not validated and may be avatars.
  const modern = ["pipStatus", "pipIntervals", "pipTimeline"].some((key) => Object.hasOwn(source, key));
  if (!modern) return base;
  const cameraRanges = normalizeCameraIntervals(source.pipIntervals, duration);
  // Both lists are normalized: intersect in linear time, not a Cartesian product.
  const pipIntervals = [];
  for (let camera = 0, share = 0; camera < cameraRanges.length && share < shareIntervals.length;) {
    const [a, b] = cameraRanges[camera], [c, d] = shareIntervals[share];
    const start = Math.max(a, c), end = Math.min(b, d);
    if (end > start) pipIntervals.push([start, end]);
    if (b < d) camera++; else share++;
  }
  const usable = !!pipUrl && shareIntervals.length > 0 && pipIntervals.length > 0;
  const requested = STATUSES.has(source.pipStatus) ? source.pipStatus : "unavailable";
  const pipStatus = ["available", "partial"].includes(requested) && !usable ? "unavailable" : requested;
  return {
    ...base, version: 1,
    pipUrl: usable && ["available", "partial"].includes(pipStatus) ? pipUrl : null,
    pipStatus, pipReason: /^[a-z0-9_]{1,80}$/.test(source.pipReason || "") ? source.pipReason : (!shareIntervals.length ? "no_screen_share" : !usable ? "no_camera" : null),
    pipIntervals, pipTimeline: timeline(source.pipTimeline, true),
    pipCorner: /^(tl|tr|bl|br)$/.test(source.pipCorner || "") ? source.pipCorner : "br",
  };
}

export function preserveCameraMetadata(coaching = {}) {
  const fields = ["version", "pipUrl", "pipStatus", "pipReason", "pipCorner", "shareIntervals", "pipIntervals", "pipTimeline", "speakerTimeline"];
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(record(coaching), key)).map((key) => [key, coaching[key]]));
}
