import type { Span } from '../../types';

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
// Optional CIDR suffix `/N`: captured loosely as 1–3 digits and then validated
// against the family-specific range (0–32 for IPv4, 0–128 for IPv6). Keeping the
// numeric check in the validator — instead of baking the range into the regex —
// lets the same suffix syntax apply to both families without diverging regexes.
const CIDR_SUFFIX = '(?:\\/\\d{1,3})?';
// Trailing `(?!\.?\d)` rejects a fifth octet (a dot followed by a digit) while
// still allowing a sentence-ending period after the address. The optional `/N`
// is appended so CIDR-tagged IPv4 ("10.0.0.0/24") is captured as one span; a
// bare `/32` cannot match because the IP body is required.
const IPV4_RE = new RegExp(`(?<![\\d.])(?:${OCTET}\\.){3}${OCTET}(?!\\.?\\d)${CIDR_SUFFIX}`, 'g');

// IPv6 is matched in two phases. Phase 1 grabs a *maximal* candidate token:
// runs of alphanumeric "groups" separated by colons (at least two colons, so a
// lone "1:2" or a clock time never qualifies), an optional embedded IPv4 tail,
// an optional `%zone` identifier, and an optional CIDR suffix `/N`. Using a
// broad `[0-9a-zA-Z]` group here — rather than strict hex — guarantees we
// always consume the *whole* word run, so non-hex noise like `::foo` is
// captured in full and then cleanly rejected by the validator instead of
// leaving a bogus `::f` fragment. Phase 2 validates the candidate against RFC
// 4291, which is what makes the detector correct for every IPv6 form
// (compression with any number of trailing groups, IPv4-mapped addresses, zone
// IDs) instead of the previous fragile hand-rolled alternation, whose
// first-match branches truncated addresses like `2001:db8::8a2e:370:7334`.
const IPV6_CANDIDATE_RE = new RegExp(
  `(?<![\\w:.])[0-9a-zA-Z]{0,4}(?::[0-9a-zA-Z]{0,4}){2,}(?:\\.\\d{1,3}){0,3}(?:%[0-9A-Za-z_-]+)?${CIDR_SUFFIX}`,
  'g'
);

const HEXTET_RE = /^[0-9a-fA-F]{1,4}$/;

function isValidIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** Splits an optional `/N` CIDR suffix from a candidate. If the suffix is
 * present but the prefix length is out of range for `family`, the suffix is
 * discarded (the bare address still detects) so a malformed mask does not
 * suppress recall on the address itself. */
function splitCidr(value: string, family: 'v4' | 'v6'): { addr: string; cidr: string } {
  const slash = value.indexOf('/');
  if (slash === -1) return { addr: value, cidr: '' };
  const mask = value.slice(slash + 1);
  const max = family === 'v4' ? 32 : 128;
  if (!/^\d{1,3}$/.test(mask) || Number(mask) > max) {
    return { addr: value.slice(0, slash), cidr: '' };
  }
  return { addr: value.slice(0, slash), cidr: value.slice(slash) };
}

/** IANA-reserved IPv4 addresses that can never identify a specific entity:
 *  - `127.0.0.0/8` — loopback ("this machine"), used in configs, dev docs, decoys
 *  - `0.0.0.0` — unspecified ("no address" / "all interfaces")
 *  - `255.255.255.255` — limited broadcast (every host on the local segment)
 *  None of these point to a person or a single device, so flagging them as PII is
 *  noise. RFC 1918 private, link-local (`169.254/16`), and documentation ranges
 *  (`192.0.2/24`, `198.51.100/24`, `203.0.113/24`) are NOT filtered — they can
 *  identify a device on a network and remain valid PII candidates. */
function isIpv4NonIdentifier(addr: string): boolean {
  if (addr === '0.0.0.0' || addr === '255.255.255.255') return true;
  return addr.startsWith('127.');
}

/** IANA-reserved IPv6 addresses that can never identify a specific entity:
 *  - `::1` — loopback
 *  Unspecified `::` is already rejected by `isValidIpv6` (the `total >= 1` rule),
 *  so it does not need a second check here. Link-local `fe80::/10` and the
 *  documentation prefix `2001:db8::/32` remain detected. */
function isIpv6NonIdentifier(addr: string): boolean {
  return addr === '::1';
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
    const { addr, cidr } = splitCidr(match[0], 'v4');
    if (isIpv4NonIdentifier(addr)) continue;
    const value = addr + cidr;
    spans.push({
      start: match.index,
      end: match.index + value.length,
      type: 'IP',
      text: value,
      confidence: 0.9,
      source: 'ip',
    });
  }
  for (const match of text.matchAll(IPV6_CANDIDATE_RE)) {
    const { addr, cidr } = splitCidr(match[0], 'v6');
    if (!isValidIpv6(addr)) continue;
    if (isIpv6NonIdentifier(addr)) continue;
    const value = addr + cidr;
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
