import { zoomError } from './zoom-security.js';

// Private object references only. The media gateway authorizes the viewer before signing access.
export function rtmsMedia(body, session) {
  const base = `r2:private/${session.user_id}/${session.meeting_id}/`;
  const media = {};
  for (const [input, column, filename] of [['recordingUrl', 'recording_url', 'recording.mp4'], ['coverUrl', 'cover_url', 'cover.jpg']]) {
    if (body[input] != null) {
      if (body[input] !== base + filename) throw zoomError('invalid_media', 400);
      media[column] = body[input];
    }
  }
  if (body.durationMin != null) {
    if (!Number.isFinite(body.durationMin) || body.durationMin < 0 || body.durationMin > session.max_meeting_min + 1) throw zoomError('invalid_duration', 400);
    // The production column is INTEGER; keep the measured sub-minute duration below.
    media.duration_min = Math.round(body.durationMin);
  }
  // Do not accept arbitrary stage JSON (session identity, access flags, URLs or credentials).
  media.stage_info = { platform: 'zoom', capture: 'rtms', rtmsSessionId: session.id };
  if (body.durationMin != null) media.stage_info.recordingDurationSec = Math.round(body.durationMin * 60000) / 1000;
  if (['audio_only_source','audio_video'].includes(body.stage?.mediaAvailability)) media.stage_info.mediaAvailability = body.stage.mediaAvailability;
  if (body.stage?.mediaCounts && ['audio','video','share'].every(key => Number.isSafeInteger(body.stage.mediaCounts[key]) && body.stage.mediaCounts[key] >= 0)) media.stage_info.mediaCounts = Object.fromEntries(['audio','video','share'].map(key => [key,body.stage.mediaCounts[key]]));
  return media;
}
export function rtmsTurns(body) {
  if (!Array.isArray(body.turns) || body.turns.length > 20000) throw zoomError('invalid_transcript', 400);
  let size = 0;
  return body.turns.map(turn => {
    if (!turn || typeof turn.text !== 'string' || turn.text.length > 20000 || (turn.speaker != null && typeof turn.speaker !== 'string')) throw zoomError('invalid_transcript', 400);
    size += turn.text.length;
    if (size > 1000000) throw zoomError('invalid_transcript', 400);
    const stamp = turn.t == null ? '' : String(turn.t);
    if (stamp && !/^(?:\d{1,4}(?:\.\d{1,3})?|(?:\d{1,2}:)?\d{1,3}:\d{2}(?:\.\d{1,3})?)$/.test(stamp)) throw zoomError('invalid_transcript', 400);
    return { text: turn.text.trim(), speaker: (turn.speaker || 'Speaker').replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 160), t: stamp };
  }).filter(turn => turn.text);
}
export const rtmsTranscript = turns => turns.map(turn => `${turn.t ? `[${turn.t}] ` : ''}${turn.speaker}: ${turn.text}`).join('\n');
export const rtmsRoster = body => Array.isArray(body.rosterNames) ? [...new Set(body.rosterNames.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 160)).filter(Boolean))].slice(0, 1000) : [];
export function rtmsReport(ai, turns, roster, speakerMap, version) {
  if (typeof ai?.summary !== 'string' || !ai.summary.trim()) throw zoomError('zoom_analysis_retry', 503);
  const mapped = turns.map(turn => ({ ...turn, speaker: speakerMap[turn.speaker] || turn.speaker }));
  const words = new Map();
  for (const turn of mapped) words.set(turn.speaker, (words.get(turn.speaker) || 0) + turn.text.split(/\s+/).length);
  const total = [...words.values()].reduce((a,b) => a+b, 0) || 1;
  const array = value => Array.isArray(value) ? value : [];
  const participants = [...words].map(([name, count]) => {
    const details = array(ai.participants).find(p => p?.name === name) || {};
    return { name, role: details.role || 'Participant', talkPct: Math.round(count / total * 100), sentiment: details.sentiment || 'Neutral', isHost: !!details.isHost };
  });
  for (const name of roster) if (!participants.some(p => p.name.toLowerCase() === name.toLowerCase())) participants.push({ name, role: 'Participant', talkPct: 0, sentiment: 'Neutral', isHost: false });
  const scores = Object.fromEntries(['overall','engagement','sentiment','balance','clarity','charisma'].map(key => [key, Number.isFinite(ai.scores?.[key]) ? Math.max(0, Math.min(100, ai.scores[key])) : 0]));
  return { summary: ai.summary, action_items: array(ai.actionItems), next_steps: array(ai.nextSteps), key_questions: array(ai.keyQuestions), topics: array(ai.topics), chapters: array(ai.chapters), highlights: array(ai.highlights),
    coaching: { ...(ai.coaching && typeof ai.coaching === 'object' && !Array.isArray(ai.coaching) ? ai.coaching : {}), pitch: ai.pitchAnalysis || null }, participants,
    // JSONB stores this as a scalar string, matching the existing transcript consumers.
    sentiment_timeline: array(ai.sentimentTimeline), sentiment_label: ai.sentimentLabel || 'Neutral', transcript: rtmsTranscript(mapped), scores, read_score: Math.round(scores.overall), category: ai.category || null, report_version: version };
}
const errorCodes = new Set(['RTMS_CONNECTION_FAILED','RTMS_MEDIA_UNAVAILABLE','RTMS_RECORDING_FAILED','RTMS_UPLOAD_FAILED','RTMS_TRANSCRIPTION_FAILED','RTMS_PROCESSING_FAILED','RTMS_NO_SPEECH']);
export const safeRtmsError = value => errorCodes.has(value) ? value : 'RTMS_PROCESSING_FAILED';
