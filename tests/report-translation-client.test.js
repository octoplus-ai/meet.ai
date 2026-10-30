import test from 'node:test';
import assert from 'node:assert/strict';
import { translatedMeeting, requestReportTranslation } from '../src/report-translation.js';

test('translated view preserves media, identity, metrics and original text', () => {
  const original = { id: 'meeting', title: 'Original', summary: 'Original summary', video: '/private/video', scores: { overall: 88 }, transcript: 'Original transcript', coaching: { speakerTimeline: [{ name: 'Alex', t: 0 }], pipUrl: '/private/camera', strengths: ['Original strength'] } };
  const raw = { id: 'meeting', reports: { summary: 'Original summary', coaching: original.coaching } };
  const before = JSON.stringify({ original, raw });
  const translated = { title: 'Traducido', report: { summary: 'Resumen traducido', coaching: { strengths: ['Fortaleza'] } } };
  const output = translatedMeeting(original, raw, translated, value => ({ ...value.reports, title: value.title, video: 'must-not-replace', id: 'must-not-replace', scores: {}, transcript: 'must-not-replace' }));
  assert.equal(output.summary, 'Resumen traducido');
  assert.equal(output.id, original.id); assert.equal(output.video, original.video);
  assert.equal(output.transcript, original.transcript); assert.deepEqual(output.scores, original.scores);
  assert.deepEqual(output.coaching.strengths, ['Fortaleza']); assert.equal(output.coaching.pipUrl, original.coaching.pipUrl);
  assert.deepEqual(output.coaching.speakerTimeline, original.coaching.speakerTimeline);
  assert.equal(JSON.stringify({ original, raw }), before);
  assert.equal(translatedMeeting(original, raw, null, () => { throw Error('must not adapt'); }), original);
});

test('translation request sends only scope and language, not report text', async t => {
  let seen;
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    seen = { path, body: JSON.parse(options.body) };
    return Response.json({ lang: 'es', translation: { report: { summary: 'Resumen' } } });
  });
  const result = await requestReportTranslation({ meetingId: 'meeting', shareToken: 'synthetic', lang: 'es', signal: new AbortController().signal });
  assert.deepEqual(seen, { path: '/api/report-translation', body: { meetingId: 'meeting', shareToken: 'synthetic', lang: 'es' } });
  assert.equal(result.translation.report.summary, 'Resumen');
});

test('translated pitch updates the displayed analysis without replacing speaker metadata', () => {
  const pitch = { overall: 'Original pitch', speakers: [{ name: 'Alex', score: 90, worked: ['Original strength'] }] };
  const original = { id: 'meeting', pitchAnalysis: pitch, coaching: { pitch, speakerTimeline: [{ name: 'Alex', t: 12 }] } };
  const translatedPitch = { overall: 'Resumen del pitch', speakers: [{ name: 'Alex', score: 90, worked: ['Fortaleza'] }] };
  const output = translatedMeeting(original, { reports: { coaching: original.coaching } }, { report: { coaching: { pitch: translatedPitch } } }, value => ({ coaching: value.reports.coaching, pitchAnalysis: value.reports.coaching.pitch }));
  assert.deepEqual(output.pitchAnalysis, translatedPitch);
  assert.deepEqual(output.coaching.speakerTimeline, original.coaching.speakerTimeline);
  assert.equal(original.pitchAnalysis.overall, 'Original pitch');
});

test('revoked access does not poll or accept a report translation', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({}, { status: 403 }); });
  await assert.rejects(requestReportTranslation({ meetingId: 'meeting', lang: 'es', signal: new AbortController().signal }), /UNAVAILABLE/);
  assert.equal(calls, 1);
});

test('changing language cancels pending lease polling', async t => {
  const controller = new AbortController(); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++; queueMicrotask(() => controller.abort());
    return Response.json({}, { status: 202, headers: { 'Retry-After': '5' } });
  });
  await assert.rejects(requestReportTranslation({ meetingId: 'meeting', lang: 'fr', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('a mismatched language response cannot replace the requested translation', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ lang: 'fr', translation: { report: {} } }));
  await assert.rejects(requestReportTranslation({ meetingId: 'meeting', lang: 'es', signal: new AbortController().signal }), /INVALID/);
});
