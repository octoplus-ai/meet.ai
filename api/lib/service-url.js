// Trusted deployment configuration only. This is not an SSRF validator for user URLs.
// Fail before attaching service credentials, and never include the input in errors.
export function httpsServiceOrigin(value) {
  try {
    if (typeof value !== 'string') throw new Error();
    // CLI-managed environment values can contain a final newline. Normalize
    // only surrounding whitespace; never repair characters inside a hostname.
    value = value.trim();
    if (!value || /[\x00-\x20\x7f\\]/.test(value)) throw new Error();
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch {
    throw Object.assign(new Error('invalid_service_origin'), { code: 'invalid_service_origin' });
  }
}

export function supabaseOrigin(env = process.env) {
  return httpsServiceOrigin(env.SUPABASE_URL || 'https://xewahhatxhmfjlujitfa.supabase.co');
}
