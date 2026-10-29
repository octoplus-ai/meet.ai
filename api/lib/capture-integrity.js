// Call with persisted capture metadata or metadata from the secret-authenticated
// recorder callback only. Transcript/AI text never establishes capture completeness.
export const PARTIAL_CAPTURE_NOTICES = Object.freeze({
  es: 'Grabación parcial: la captura se interrumpió. Este reporte resume únicamente el tramo recuperado; no cubre el resto de la reunión.',
  en: 'Partial recording: capture was interrupted. This report summarizes only the recovered portion; it does not cover the rest of the meeting.',
});
const interruptedReasons = new Set(['renderer_unresponsive', 'renderer_crashed', 'renderer_disconnected']);

export function partialCaptureSummary(summary, stage) {
  if (typeof summary !== 'string' || !summary.trim()) return summary;
  if (!stage || typeof stage !== 'object' || Array.isArray(stage)) return summary;
  const partial = stage.captureInterrupted === true || stage.recovery?.fullMeetingRecovered === false
    || interruptedReasons.has(stage.endReason);
  if (!partial) return summary;
  let original = summary;
  // Reanalysis and delivery can both call this helper. Keep one notice and preserve
  // the original summary verbatim after it, including when a stored language changes.
  let removed;
  do {
    removed = false;
    for (const notice of Object.values(PARTIAL_CAPTURE_NOTICES)) {
      if (original === notice || original.startsWith(notice + '\n\n')) {
        original = original.slice(notice.length).replace(/^\n\n/, ''); removed = true; break;
      }
    }
  } while (removed && original);
  const language = typeof stage.languageCode === 'string' && /^es(?:[-_]|$)/i.test(stage.languageCode.trim()) ? 'es' : 'en';
  return PARTIAL_CAPTURE_NOTICES[language] + (original ? '\n\n' + original : '');
}
