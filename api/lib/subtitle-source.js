// Match the report player's transcript-turn parsing. Translation must use saved
// report content, never arbitrary text supplied by a shared viewer.
export function subtitleTexts(raw) {
  if (Array.isArray(raw)) return raw.map(turn => String(turn?.text || ''));
  if (typeof raw !== 'string') return [];
  const turns = [];
  const speaker = value => value && value.length <= 48 && (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\-]* ?\d{1,3}$/.test(value)
    || /^[A-Za-zÀ-ÿ'.\-]+(?:[ ][A-Za-zÀ-ÿ'.()\-]+){0,6}$/.test(value));
  for (const line of raw.split('\n').map(value => value.trim()).filter(Boolean)) {
    const stamp = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/) || line.match(/^\[(\d{1,5})\]\s*(.*)$/);
    const rest = stamp ? stamp[2] : line, colon = rest.indexOf(':');
    const name = rest.slice(0, colon).trim(), text = rest.slice(colon + 1).trim();
    if (colon > 0 && text && speaker(name)) turns.push(text);
    else if (turns.length) turns[turns.length - 1] += ' ' + rest;
    else turns.push(rest);
  }
  return turns;
}
