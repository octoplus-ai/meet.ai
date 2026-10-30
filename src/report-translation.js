// Translations are display overlays. Never replace media, access grants, identity,
// transcript or metrics with a translation response.
export function translatedMeeting(original, raw, translation, adapt) {
  if (!original || !raw || !translation?.report) return original;
  const report = (Array.isArray(raw.reports) ? raw.reports[0] : raw.reports) || {};
  const view = adapt({ ...raw, title: translation.title || raw.title, reports: {
    ...report, ...translation.report,
    coaching: { ...(report.coaching || {}), ...(translation.report.coaching || {}) },
  } });
  const result = { ...original };
  for (const field of ['title', 'summary', 'keyQA', 'keyQuestions', 'actionItems', 'nextSteps', 'chapters', 'highlights', 'topics']) {
    result[field] = view[field];
  }
  result.coaching = { ...(original.coaching || {}) };
  for (const field of ['strengths', 'improvements', 'tips', 'pitch']) {
    if (view.coaching?.[field] !== undefined) result.coaching[field] = view.coaching[field];
  }
  if (translation.report.coaching?.pitch) result.pitchAnalysis = view.pitchAnalysis;
  return result;
}

function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function requestReportTranslation({ meetingId, shareToken, lang, signal }) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const response = await fetch('/api/report-translation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ meetingId, shareToken, lang }),
    });
    if (response.status === 202) {
      const retry = Number(response.headers.get('Retry-After'));
      await waitForRetry(Number.isFinite(retry) && retry > 0 ? Math.min(5, retry) * 1000 : 2000, signal);
      continue;
    }
    if (!response.ok) throw new Error('REPORT_TRANSLATION_UNAVAILABLE');
    const result = await response.json();
    if (result.lang !== lang || !result.translation?.report) throw new Error('INVALID_REPORT_TRANSLATION');
    return result;
  }
  throw new Error('REPORT_TRANSLATION_TIMEOUT');
}
