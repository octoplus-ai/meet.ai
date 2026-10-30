// Synthetic fixtures only. No production APIs, private report, or AI provider.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SharedReportView } from '../src/App.jsx';
const query = new URLSearchParams(location.search);
const scenario = query.get('scenario') || 'report';
const report = { summary: 'Original planning summary.', topics: ['Planning'],
  key_questions: [{ q: 'When is the review?', a: 'Friday.', t: '1:00' }],
  action_items: [{ owner: 'Alex', task: 'Prepare the proposal', due: '2026-11-01', t: '1:10' }],
  next_steps: ['Review the proposal'], chapters: [{ title: 'Project plan', summary: 'Plan overview', t: '0:00' }],
  highlights: [{ text: 'The proposal is ready.', t: '1:15' }], coaching: { strengths: ['Clear objectives'], improvements: ['Ask questions'], tips: ['Confirm the plan'] },
  participants: [{ name: 'Alex', talkPct: 60 }, { name: 'Sam', talkPct: 40 }], scores: { engagement: 80, sentiment: 78 }, transcript: 'Alex [00:00]: Original transcript.' };
const meeting = { id: 'synthetic-report', title: 'Planning fixture', status: 'done', source: 'Zoom', start_time: '2026-10-29T15:00:00Z', end_time: '2026-10-29T15:20:00Z', duration_min: 20, reports: report };
const summary = { es: 'Resumen de planificación traducido.', fr: 'Résumé de planification traduit.', en: 'Translated planning summary.', he: 'סיכום התכנון המתורגם.' };
let calls = 0;
window.fetch = async (input, init = {}) => {
  const path = String(input);
  if (path.startsWith('/api/shared-report')) {
    if (scenario === 'gate') return Response.json({ needOtp: true, emailHint: 'a•••@example.invalid' }, { status: 403 });
    if (scenario === 'unavailable') return Response.json({}, { status: 404 });
    return Response.json({ meeting, role: scenario === 'editor' ? 'Editor' : 'Viewer' });
  }
  if (path.startsWith('/api/artifacts')) return Response.json({ doc: false, deck: false });
  if (path === '/api/report-translation') {
    calls++;
    const { lang } = JSON.parse(init.body);
    document.querySelector('[data-request-count]').textContent = String(calls);
    if (scenario === 'error') return Response.json({ error: 'translation_failed' }, { status: 502 });
    await new Promise(resolve => setTimeout(resolve, lang === 'fr' ? 1500 : 180));
    const translated = structuredClone(report);
    translated.summary = summary[lang] || 'Synthetic translation';
    if (lang === 'es') {
      translated.key_questions[0].q = '¿Cuándo es la revisión?'; translated.key_questions[0].a = 'El viernes.';
      translated.action_items[0].task = 'Preparar la propuesta'; translated.chapters[0].title = 'Plan del proyecto';
    }
    return Response.json({ lang, sourceHash: 'synthetic', cached: false, translation: { title: 'Planning fixture', report: translated } });
  }
  throw new Error('Fixture blocked unexpected request');
};
function Fixture() {
  const [lang, setLang] = useState(() => localStorage.getItem('fixture-language') || 'en');
  return <><output data-request-count hidden aria-label="Synthetic request count">0</output><SharedReportView token="synthetic-share" lang={lang} setLang={value => { setLang(value); localStorage.setItem('fixture-language', value); }} /></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
