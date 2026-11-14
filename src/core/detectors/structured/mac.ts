import type { Span } from '../../types';

// MAC addresses are only matched when they carry separators, which keeps the
// false-positive rate low (a bare 12-hex run is indistinguishable from a hash
// fragment, so it is intentionally not matched). EUI-64 (8-group) MACs are also
// excluded because they are valid IPv6 addresses and would be ambiguous.

// Colon- or hyphen-separated, six 2-hex groups. The `\1` backreference forces a
// single consistent separator, so a mixed run like `00:1A-2B:...` is rejected.
// The `(?<![\w:-])`/`(?![\w:-])` guards prevent matching a fragment of a longer
// hex or separator run.
//
// A leading `+` is also excluded: an all-decimal hyphen-grouped run like
// `98-21-88-77-55-44` is a valid MAC *shape*, but when it is glued to a `+`
// prefix it is the tail of an international phone number (`+98-21-88-77-55-44`)
// — a MAC address never carries a `+`. Without this guard the higher-confidence
// MAC span shadowed the PHONE span in overlap resolution, yielding both a MAC
// false positive and a PHONE false negative.
const MAC_SEP_RE =
  /(?<![\w:+-])[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![\w:-])/g;

// Compact triple-group notation: three 4-hex groups joined by a single
// consistent '.' (Cisco standard) or '-' (compact hyphenated form). The `\1`
// backreference forbids a mixed separator, mirroring MAC_SEP_RE.
//
// The trailing guard is deliberately narrower than a blanket `(?![\w.-])`: it
// rejects only a *continuation* of a longer dotted/hyphenated hex run
// (`.[hex]` / `-[hex]`, e.g. the first three groups of `1122.3344.5566.7788`)
// while still allowing a sentence-ending separator. A MAC that closes a
// sentence ("… 1122.3344.5566.") must not be dropped — the old `(?![\w.])`
// guard swallowed the trailing period and lost the whole address, which then
// leaked out as a PHONE.
const MAC_COMPACT_RE =
  /(?<![\w.+-])[0-9A-Fa-f]{4}([.-])[0-9A-Fa-f]{4}\1[0-9A-Fa-f]{4}(?![\w]|[.-][0-9A-Fa-f])/g;

// Dot-separated six 2-hex groups (`00.1a.2b.3c.4d.5e`) — a vendor/tooling MAC
// notation that mirrors the colon/hyphen six-group form with '.' as the single
// separator. It gets its own pattern rather than folding '.' into MAC_SEP_RE for
// two reasons:
//   1. An all-decimal dotted six-group run (`33.44.55.66.77.88`) otherwise falls
//      straight through to the PHONE detector, which reads the dotted grouping as
//      a phone — producing a MAC false negative *and* a PHONE false positive from
//      one token. The higher-confidence MAC span emitted here shadows the PHONE
//      span in overlap resolution, closing both at once.
//   2. The dot form needs the compact detector's nuanced trailing guard: a blanket
//      `(?![\w.])` would reject a legitimate sentence-ending MAC, while a plain
//      `(?![\w:-])` would partial-match the first six groups of a longer dotted
//      hex run. The lookahead rejects only a *continuation* (a 7th `.hex` group)
//      yet still allows a closing '.'. The lookbehind forbids a preceding word
//      char, '.', '+' or '-' so the pattern never matches the tail of a longer
//      dotted/alnum run — and never a '+'-prefixed international phone written
//      with dots, since a MAC never carries a '+'.
// Six 2-digit groups is the discriminator from a dotted phone: national dotted
// groupings (e.g. French `01.42.34.56.78`) run to five pairs / ten digits, never
// six.
const MAC_DOT6_RE = /(?<![\w.+-])[0-9A-Fa-f]{2}(?:\.[0-9A-Fa-f]{2}){5}(?![\w]|\.[0-9A-Fa-f])/g;

// The broadcast MAC (all-`FF`) is a reserved sentinel that identifies no device,
// so it carries no PII — it shows up in configs, docs, and network diagnostics
// as a "send to everyone" placeholder, not as a hardware id. Reject it
// structurally (strip the separator + lowercase) so the guard covers every
// notation — colon, hyphen, and Cisco dot — and any casing, rather than one
// literal string. Kept intentionally narrow: multicast / locally-administered /
// null (all-`00`) forms are NOT excluded here — an all-`00` address is all
// digits and would fall through to the PHONE detector, and both classes can be
// real device identifiers, so suppressing them would trade a rare FP for
// recall/precision regressions elsewhere.
function isBroadcastMac(raw: string): boolean {
  return /^f{12}$/.test(raw.replace(/[.:-]/g, '').toLowerCase());
}

export function detectMacs(text: string): Span[] {
  const spans: Span[] = [];
  for (const re of [MAC_SEP_RE, MAC_COMPACT_RE, MAC_DOT6_RE]) {
    for (const match of text.matchAll(re)) {
      if (isBroadcastMac(match[0])) continue;
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
