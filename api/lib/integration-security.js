import { lookup as lookupDns } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const TARGETS = new Set(['slack', 'discord', 'notion', 'webhooks', 'webhook', 'hubspot', 'salesforce', 'confluence']);
export const integrationTarget = value => typeof value === 'string' && TARGETS.has(value);
export class IntegrationError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const invalid = () => new IntegrationError('invalid_integration_config');
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Conservative public-unicast policy. Reject special-use IPv4, and IPv6
// mapped/NAT64/tunnel ranges that could route to a private IPv4 destination.
export function publicIntegrationAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return false;
  if (isIP(address) === 4) {
    const [a, b, c, d] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)
      || (a === 168 && b === 63 && c === 129 && d === 16));
  }
  if (isIP(address) !== 6 || address.includes('.')) return false;
  const halves = address.toLowerCase().split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const words = halves.length === 1 ? left : [...left, ...Array(8-left.length-right.length).fill('0'), ...right];
  const [a, b] = words.map(word => parseInt(word, 16));
  return a >= 0x2000 && a <= 0x3fff
    && !(a === 0x2001 && (b <= 0x1ff || b === 0xdb8))
    && a !== 0x2002 && !(a === 0x3fff && b <= 0x0fff);
}

export function integrationUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || value !== value.trim()
    || !/^https:\/\//i.test(value) || /[\x00-\x20\x7f\\#]/.test(value)
    || value.slice(value.indexOf('//') + 2).split(/[/?]/, 1)[0].includes('@')) throw invalid();
  let url; try { url = new URL(value); } catch { throw invalid(); }
  const host = url.hostname;
  // Public DNS names on standard HTTPS only. URL canonicalization also catches
  // integer/hex/octal IPv4 notation before rejecting IP-literal destinations.
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')
    || isIP(host.replace(/^\[|\]$/g, '')) || host.length > 253 || !host.includes('.')
    || host.endsWith('.') || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    || /(?:^|\.)(?:localhost|local|internal|localdomain|lan|home|test|invalid|onion|arpa)$/.test(host)) throw invalid();
  return url;
}

const timeoutValue = value => Math.max(1, Math.min(10000, Number(value) || 10000));
async function within(promise, timeoutMs) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new IntegrationError('integration_destination_unavailable', 502)), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
export async function resolveIntegrationDestination(value, { lookup = lookupDns, timeoutMs = 10000 } = {}) {
  const url = integrationUrl(value);
  let addresses;
  try { addresses = await within(Promise.resolve().then(() => lookup(url.hostname, { all: true, verbatim: true })), timeoutValue(timeoutMs)); }
  catch { throw new IntegrationError('integration_destination_unavailable', 502); }
  if (!Array.isArray(addresses) || !addresses.length || addresses.length > 64
    || addresses.some(row => !row || ![4, 6].includes(row.family) || isIP(row.address) !== row.family || !publicIntegrationAddress(row.address))) {
    throw new IntegrationError('integration_destination_not_public');
  }
  return { url, address: addresses[0].address, family: addresses[0].family };
}

export function normalizeIntegrationConfig(target, config) {
  if (!integrationTarget(target) || !plainObject(config)) throw invalid();
  const keys = target === 'notion' ? ['token', 'parent', 'autoPush'] : ['url', 'autoPush'];
  if (Object.keys(config).some(key => !keys.includes(key)) || (config.autoPush !== undefined && typeof config.autoPush !== 'boolean')) throw invalid();
  const auto = config.autoPush === undefined ? {} : { autoPush: config.autoPush };
  if (target === 'notion') {
    if (typeof config.token !== 'string' || !/^[\x21-\x7e]{16,512}$/.test(config.token)
      || typeof config.parent !== 'string' || !/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(config.parent)) throw invalid();
    return { token: config.token, parent: config.parent, ...auto };
  }
  return { url: integrationUrl(config.url).href, ...auto };
}
export async function validateIntegrationConfig(target, config, options) {
  const normalized = normalizeIntegrationConfig(target, config);
  if (normalized.url) await resolveIntegrationDestination(normalized.url, options);
  return normalized;
}

// Resolve once, validate EVERY address, then pin socket lookup to that result.
// Preserve Host/SNI/certificate checks. A subsequent fetch(url) would resolve
// again and allow rebinding; there is deliberately no fetch fallback.
export function createIntegrationSender({ lookup = lookupDns, request = httpsRequest } = {}) {
  return async function sendIntegrationJson(value, { body, headers = {}, timeoutMs = 10000 } = {}) {
    const started = Date.now(), budget = timeoutValue(timeoutMs);
    const destination = await resolveIntegrationDestination(value, { lookup, timeoutMs: budget });
    const remaining = budget - (Date.now()-started);
    if (remaining <= 0) throw new IntegrationError('integration_destination_unavailable', 502);
    if (typeof body !== 'string' || Buffer.byteLength(body) > 1024*1024) throw invalid();
    return new Promise((resolve, reject) => {
      let req, timer, settled = false;
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const failed = () => finish(new IntegrationError('integration_delivery_unconfirmed', 502));
      const pinnedLookup = (_hostname, options, callback) => {
        if (typeof options === 'function') { callback = options; options = {}; }
        const address = { address: destination.address, family: destination.family };
        if (options?.all) callback(null, [address]); else callback(null, address.address, address.family);
      };
      try {
        req = request(destination.url, {
          method: 'POST', agent: false, lookup: pinnedLookup, family: destination.family,
          autoSelectFamily: false, servername: destination.url.hostname, rejectUnauthorized: true, minVersion: 'TLSv1.2',
          headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, response => {
          // No response body is read or exposed. Never follow Location.
          const status = response.statusCode;
          response.on('error', () => {});
          response.destroy();
          if (!Number.isInteger(status) || status < 100 || status > 599) return failed();
          finish(null, { status, ok: status >= 200 && status < 300 });
        });
        req.on('error', failed);
        timer = setTimeout(() => { failed(); req.destroy(); }, remaining);
        req.end(body);
      } catch { failed(); req?.destroy(); }
    });
  };
}
export const sendIntegrationJson = createIntegrationSender();
