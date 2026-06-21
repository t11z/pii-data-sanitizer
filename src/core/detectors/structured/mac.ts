import type { Span } from '../../types';

// MAC addresses are only matched when they carry separators, which keeps the
// false-positive rate low (a bare 12-hex run is indistinguishable from a hash
// fragment, so it is intentionally not matched). EUI-64 (8-group) MACs are also
// excluded because they are valid IPv6 addresses and would be ambiguous.

// Colon- or hyphen-separated, six 2-hex groups. The `\1` backreference forces a
// single consistent separator, so a mixed run like `00:1A-2B:...` is rejected.
// The `(?<![\w:-])`/`(?![\w:-])` guards prevent matching a fragment of a longer
// hex or separator run.
const MAC_SEP_RE =
  /(?<![\w:-])[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![\w:-])/g;

// Cisco dot notation: three 4-hex groups separated by dots.
const MAC_DOT_RE = /(?<![\w.])[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}(?![\w.])/g;

export function detectMacs(text: string): Span[] {
  const spans: Span[] = [];
  for (const re of [MAC_SEP_RE, MAC_DOT_RE]) {
    for (const match of text.matchAll(re)) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'MAC',
        text: match[0],
        confidence: 0.9,
        source: 'mac',
      });
    }
  }
  return spans;
}
