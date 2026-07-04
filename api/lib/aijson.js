// Robustly turn an LLM text response into a JSON object. Handles: ```json fences, leading/trailing
// prose, trailing commas, and - the important one - TRUNCATION (the model hit max_tokens mid-JSON),
// which is what made /api/document and /api/slides throw a 500 on richer meetings. On truncation it
// repairs the JSON by cutting at the last complete value, dropping a dangling key/comma, and closing
// the still-open braces/brackets, so a slightly shorter but VALID object is returned instead of a crash.
// Returns the parsed object, or null if nothing salvageable.
export function extractJson(raw) {
  if (raw == null) return null;
  let t = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };

  let v = tryParse(t);
  if (v !== undefined) return v;

  const start = t.indexOf("{");
  if (start < 0) return null;
  t = t.slice(start);

  // Single pass. Track two truncation-repair cut points, each with the open-bracket stack there:
  //   containerEnd - the last "}"/"]" that closed (always a safe place to cut and close parents)
  //   valueEnd     - the last completed scalar value (string / number / literal), for when nothing
  //                  has closed yet (e.g. truncated inside the first array of strings).
  let inStr = false, esc = false, depth = 0, closeTop = -1;
  let containerEnd = -1, containerStack = [];
  let valueEnd = -1, valueStack = [];
  const stack = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') { inStr = false; valueEnd = i; valueStack = stack.slice(); }
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") { stack.push(c === "{" ? "}" : "]"); depth++; }
    else if (c === "}" || c === "]") { stack.pop(); depth--; containerEnd = i; containerStack = stack.slice(); valueEnd = i; valueStack = stack.slice(); if (depth === 0) { closeTop = i; break; } }
    else if (/[0-9tfn]/i.test(c)) { valueEnd = i; valueStack = stack.slice(); } // number / true / false / null tail
  }

  if (closeTop > 0) {
    v = tryParse(t.slice(0, closeTop + 1));
    if (v !== undefined) return v;
    v = tryParse(t.slice(0, closeTop + 1).replace(/,(\s*[}\]])/g, "$1")); // strip trailing commas
    if (v !== undefined) return v;
  }

  // Truncation repair: prefer cutting at the last closed container, else the last complete value.
  const repair = (end, stk) => {
    if (end <= 0) return undefined;
    let head = t.slice(0, end + 1);
    // drop a trailing dangling key ("...": or a lone "...") and any trailing comma
    head = head.replace(/,\s*(?:\{\s*)?"[^"]*"\s*:?\s*$/, "").replace(/\s*,\s*$/, "");
    const closers = stk.slice().reverse().join("");
    let r = tryParse(head + closers);
    if (r !== undefined) return r;
    return tryParse((head + closers).replace(/,(\s*[}\]])/g, "$1"));
  };
  let out = repair(containerEnd, containerStack);
  if (out !== undefined) return out;
  out = repair(valueEnd, valueStack);
  if (out !== undefined) return out;
  return null;
}
