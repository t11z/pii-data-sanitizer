import type { Span } from '../../types';

// MAC addresses carrying separators are matched structurally, which keeps the
// false-positive rate low. A bare 12-hex run has no separators to key on and is
// indistinguishable from a hash/digest fragment, so it is NOT matched on shape
// alone — it is only claimed when an explicit "MAC" cue word precedes it (see
// MAC_BARE_RE below). EUI-64 (8-group) MACs are excluded because they are valid
// IPv6 addresses and would be ambiguous.

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

// Separator-less (bare) 12-hex MAC, e.g. "MAC 001a2b3c4d5e". A bare hex run on
// its own is ambiguous with a commit hash / digest fragment, so — unlike the
// separated forms above — it is matched ONLY when an explicit "MAC" cue word
// sits immediately before it. This mirrors the cue-gated strategy the passport
// detector uses for its checksum-less numbers: the cue supplies the precision a
// structural rule alone cannot, while still generalizing to any bare address,
// not a memorized value. NIC/switch provisioning logs routinely print MACs this
// way (no colons/dots), which the separated patterns could never reach.
//
// `\bMAC\b` requires the cue to be a standalone token — "iMac", "Mac mini", and
// other prose can't trigger it. `[\s:=#-]+` requires at least one separator
// between the cue and the run (so "MAC" glued to the value, or a document-type
// word like "MAC address table", can't match), and the trailing
// `(?![0-9A-Fa-f])` pins the run to exactly 12 hex digits so a longer digest
// tail is never sliced into a 12-char span. Only group 1 (the address) is
// claimed; the cue itself stays outside the span.
const MAC_BARE_RE = /\bMAC\b[\s:=#-]+([0-9A-Fa-f]{12})(?![0-9A-Fa-f])/gi;

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
  for (const re of [MAC_SEP_RE, MAC_COMPACT_RE]) {
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
  // Cue-gated bare form. The span covers only the captured address (group 1),
  // which — because the trailing lookahead consumes nothing — is always the
  // suffix of the overall match, so its offset is derivable from the lengths.
  // Confidence is a notch below the separated forms (0.85 vs 0.9): it leans on a
  // context cue rather than pure structure, but still clears the threshold.
  for (const match of text.matchAll(MAC_BARE_RE)) {
    const addr = match[1];
    if (isBroadcastMac(addr)) continue;
    const start = match.index + (match[0].length - addr.length);
    spans.push({
      start,
      end: start + addr.length,
      type: 'MAC',
      text: addr,
      confidence: 0.85,
      source: 'mac',
    });
  }
  return spans;
}
