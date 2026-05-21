import type { Span } from '../../types';

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
// Trailing `(?!\.?\d)` rejects a fifth octet (a dot followed by a digit) while
// still allowing a sentence-ending period after the address.
const IPV4_RE = new RegExp(`(?<![\\d.])(?:${OCTET}\\.){3}${OCTET}(?!\\.?\\d)`, 'g');

// Compressed/uncompressed IPv6 (covers the common forms; not exhaustive).
// JS alternation is first-match (not longest-match), so the branches that
// capture a trailing hextet must precede the bare `::`-terminated branch;
// otherwise `fe80::1` matches only the `fe80::` prefix and drops the last group.
const IPV6_RE =
  /(?<![\w:])(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|(?:[0-9a-fA-F]{1,4}:){1,7}:|::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}(?![\w:])/g;

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
  for (const match of text.matchAll(IPV6_RE)) {
    const value = match[0];
    if (!value.includes('::') && value.split(':').length !== 8) continue;
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
