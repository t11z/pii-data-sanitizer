import type { Span } from '../../types';

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
// Trailing `(?!\.?\d)` rejects a fifth octet (a dot followed by a digit) while
// still allowing a sentence-ending period after the address.
const IPV4_RE = new RegExp(`(?<![\\d.])(?:${OCTET}\\.){3}${OCTET}(?!\\.?\\d)`, 'g');

// IPv6 is matched in two phases. Phase 1 grabs a *maximal* candidate token:
// runs of alphanumeric "groups" separated by colons (at least two colons, so a
// lone "1:2" or a clock time never qualifies), an optional embedded IPv4 tail,
// and an optional `%zone` identifier. Using a broad `[0-9a-zA-Z]` group here —
// rather than strict hex — guarantees we always consume the *whole* word run, so
// non-hex noise like `::foo` is captured in full and then cleanly rejected by
// the validator instead of leaving a bogus `::f` fragment. Phase 2 validates the
// candidate against RFC 4291, which is what makes the detector correct for every
// IPv6 form (compression with any number of trailing groups, IPv4-mapped
// addresses, zone IDs) instead of the previous fragile hand-rolled alternation,
// whose first-match branches truncated addresses like `2001:db8::8a2e:370:7334`.
const IPV6_CANDIDATE_RE =
  /(?<![\w:.])[0-9a-zA-Z]{0,4}(?::[0-9a-zA-Z]{0,4}){2,}(?:\.\d{1,3}){0,3}(?:%[0-9A-Za-z_-]+)?/g;

const HEXTET_RE = /^[0-9a-fA-F]{1,4}$/;

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** Validates an IPv6 candidate per RFC 4291 (compression, embedded IPv4, zone). */
function isValidIpv6(candidate: string): boolean {
  let addr = candidate;

  // Optional zone identifier, e.g. `fe80::1%eth0` or `%1`.
  const pct = addr.indexOf('%');
  if (pct !== -1) {
    if (pct === addr.length - 1) return false;
    addr = addr.slice(0, pct);
  }

  if (!addr.includes(':')) return false;

  // An embedded IPv4 tail (`::ffff:192.0.2.1`, `64:ff9b::203.0.113.5`) occupies
  // the final two 16-bit groups. Rewrite it as two hextets so the colon
  // structure (including any preceding `::`) is preserved and the rest validates
  // uniformly below.
  const lastColon = addr.lastIndexOf(':');
  const tail = addr.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isValidIpv4(tail)) return false;
    addr = `${addr.slice(0, lastColon + 1)}0:0`;
  }

  const doubleColon = addr.indexOf('::');
  if (doubleColon !== -1) {
    // At most one `::` is permitted.
    if (addr.indexOf('::', doubleColon + 1) !== -1) return false;
    const [head, rest] = addr.split('::');
    const headGroups = head === '' ? [] : head.split(':');
    const tailGroups = rest === '' ? [] : rest.split(':');
    if (![...headGroups, ...tailGroups].every((g) => HEXTET_RE.test(g))) return false;
    const total = headGroups.length + tailGroups.length;
    // `::` must elide at least one zero group, and a bare `::` (total 0) carries
    // no information — reject it to avoid matching stray `::` in prose/code.
    return total >= 1 && total <= 7;
  }

  // No compression: exactly eight 16-bit groups.
  const groups = addr.split(':');
  if (!groups.every((g) => HEXTET_RE.test(g))) return false;
  return groups.length === 8;
}

export function detectIps(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(IPV4_RE)) {
    spans.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'IP',
      text: match[0],
      confidence: 0.9,
      source: 'ip',
    });
  }
  for (const match of text.matchAll(IPV6_CANDIDATE_RE)) {
    const value = match[0];
    if (!isValidIpv6(value)) continue;
    spans.push({
      start: match.index,
      end: match.index + value.length,
      type: 'IP',
      text: value,
      confidence: 0.9,
      source: 'ip',
    });
  }
  return spans;
}
