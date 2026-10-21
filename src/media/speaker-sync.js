export const inIntervals = (time, intervals) => Number.isFinite(time) && Array.isArray(intervals) && intervals.some((v) => Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) && time >= v[0] && time < v[1]);

// Coverage is evidence, not a guess from the presence of a video URL. Old files may
// contain avatars; keep them usable with an explicit warning, never label them verified.
export function speakerAvailability(media = {}, time = 0) {
  const verified = Array.isArray(media.pipIntervals) && typeof media.pipStatus === "string";
  const shares = Array.isArray(media.shareIntervals) ? media.shareIntervals : [];
  const inShare = inIntervals(time, shares);
  const available = typeof media.pipUrl === "string" && !!media.pipUrl &&
    (!media.pipStatus || ["available", "partial"].includes(media.pipStatus));
  const covered = verified ? inIntervals(time, media.pipIntervals) : inShare;
  let reason;
  if (media.pipStatus === "disabled") reason = "disabled";
  else if (!verified && media.pipUrl) reason = "legacy";
  else if (!shares.length && verified) reason = "noShares";
  else if (verified && !inShare) reason = "waiting";
  else if (verified && inShare && !covered) {
    const events = Array.isArray(media.pipTimeline) ? media.pipTimeline : [];
    const event = events.filter((entry) => entry && Number.isFinite(entry.t) && entry.t <= time).at(-1);
    reason = event?.state === "camera_off" ? "cameraOff" : "noCamera";
  } else if (!available) reason = "unavailable";
  else reason = media.pipStatus === "partial" ? "partial" : null;
  return { available, verified, inShare, visible: available && inShare && covered, reason };
}

// One binding per actual video element. Cleanup cancels callbacks on that same
// element, so collapse/reopen cannot leave a detached video receiving updates.
export function bindSpeakerVideo(main, camera, { onError = () => {}, clock = globalThis } = {}) {
  if (!main || !camera) return () => {};
  let disposed = false, frame = 0, pendingPlay = false;
  const sync = () => {
    // Metadata is enough to seek to the main timestamp; waiting for loadeddata
    // first can leave a paused, late-enabled camera buffering the wrong frame.
    if (disposed || camera.readyState < 1) return;
    const target = main.currentTime;
    if (!Number.isFinite(target)) return;
    if (Number.isFinite(camera.duration) && camera.duration > 0 && target >= camera.duration) {
      camera.pause();
      if (!main.ended) onError();
      return;
    }
    try {
      const drift = camera.currentTime - target;
      const rate = main.playbackRate || 1;
      if (Math.abs(drift) > 0.15 && !camera.seeking) camera.currentTime = target;
      camera.playbackRate = Math.abs(drift) > 0.025 && Math.abs(drift) <= 0.15 ? rate * (drift > 0 ? 0.95 : 1.05) : rate;
      if (main.paused || main.ended) camera.pause();
      else if (camera.readyState >= 2 && camera.paused && !pendingPlay) {
        pendingPlay = true;
        Promise.resolve(camera.play()).catch(() => { if (!disposed) onError(); }).finally(() => { pendingPlay = false; });
      }
    } catch { if (!disposed) onError(); }
  };
  const events = ["timeupdate", "seeked", "play", "pause", "ratechange", "ended"];
  events.forEach((event) => main.addEventListener(event, sync));
  const cameraEvents = ["loadedmetadata", "loadeddata", "canplay"];
  cameraEvents.forEach((event) => camera.addEventListener(event, sync));
  const tick = () => { if (disposed) return; sync(); frame = main.requestVideoFrameCallback(tick); };
  if (typeof main.requestVideoFrameCallback === "function") frame = main.requestVideoFrameCallback(tick);
  const timer = clock.setInterval(sync, 200);
  sync();
  return () => {
    disposed = true; clock.clearInterval(timer);
    if (frame && main.cancelVideoFrameCallback) main.cancelVideoFrameCallback(frame);
    events.forEach((event) => main.removeEventListener(event, sync));
    cameraEvents.forEach((event) => camera.removeEventListener(event, sync)); camera.pause();
  };
}
