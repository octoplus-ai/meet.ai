// Em/en dashes in AI-generated text read as an obvious "AI tell", so the user never wants them
// in anything the app generates. The prompt instruction reduces them; this is the belt-and-
// suspenders guarantee that none slip through to the user. Only the two unicode dash chars are
// touched (— U+2014, – U+2013) - a normal hyphen "-" is left alone, and these chars never appear
// in base64/data URLs, so running it over a whole object is safe.
export function stripDashes(s) {
  return typeof s === "string" ? s.replace(/[—–]/g, "-") : s;
}

// Recursively strip dashes from every string in an object/array (mirrors process.js noDashes).
export function noDashes(v) {
  if (typeof v === "string") return v.replace(/[—–]/g, "-");
  if (Array.isArray(v)) return v.map(noDashes);
  if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = noDashes(v[k]); return o; }
  return v;
}
