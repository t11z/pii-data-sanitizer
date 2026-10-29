import type { Span } from '../../types';

// Passport numbers have no universal checksum and vary by country, so a bare
// alphanumeric token can't be claimed as one. We require an explicit "passport"
// (or German "Reisepass"/"Passnummer") cue, then take the following uppercase
// alphanumeric token that contains at least one digit and is 6–14 characters long.
//
// The upper bound is 14, not 9 or 12: the ICAO MRZ document-number field maxes at
// nine, but plenty of national schemes print longer human-readable numbers — and
// several glue a two-letter issuing-country code straight onto the number with no
// separator ("IN2B3C4D5E6F7", "IR4G5H6I7J8K9"), pushing a legitimate passport to
// 13 characters. So the length is *validated in code* against MAX_LEN rather than
// baked into the regex quantifier: the pattern captures the whole alphanumeric run
// and we reject an over-long run cleanly. The old `{6,12}\b` quantifier did the
// opposite — because the run is followed by `\b`, a 13-char value could not even
// partial-match (every interior position is a word boundary failure), so the whole
// entry was silently dropped, a recall cliff. The generous bound is safe precisely
// because the cue is required.
//
// The case is kept strict (uppercase) on purpose — without the `i` flag a lowercase
// word after the cue ("passport please") can't be mistaken for a number. Cue casing is
// handled with explicit leading-character classes instead.
const MAX_LEN = 14;
//
// Between the cue word and the number, forms and records commonly insert a
// document-type noun ("passport document V…", "passport book number V…", German
// "Reisepass Dokument V…"). That noun is accepted as an optional connector so the
// whole "<cue> <document-noun> [No./Number] <value>" phrasing class is covered — not a
// single memorized value. It stays precision-safe because the number token below is
// still required to be an uppercase, digit-bearing 6–14 char run, so a trailing prose
// word ("passport document scanned") can never be mistaken for a number.
const DOC_NOUN = String.raw`(?:\s+(?:[Dd]ocument|[Dd]oc\.?|[Dd]okument|[Dd]ok\.?|[Bb]ook(?:let)?))?`;
//
// The optional connector between the cue word and the number covers the common
// label forms: "No."/"Number"/"Nr."/"#" plus "Reference"/"Ref." — the latter is
// how support tickets and case files routinely tag a passport ("Passport Ref:
// X"). "Reference" is listed before "Ref" only for readability; the required
// separator + digit-bearing NUMBER gate still makes the backtracking pick the
// form that actually precedes a number, so a cue with no number ("Passport Ref
// please") stays unmatched.
const CUE = String.raw`(?:[Pp]assport|[Rr]eisepass|[Pp]assnummer)${DOC_NOUN}(?:\s*(?:[Nn]o\.?|[Nn]umber|[Nn]r\.?|[Rr]eference|[Rr]ef\.?|#))?`;
const NUMBER = String.raw`((?=[A-Z0-9]*\d)[A-Z0-9]{6,})\b`;
const PASSPORT_RE = new RegExp(`${CUE}(?:\\s*:\\s*|\\s+)${NUMBER}`, 'g');

export function detectPassports(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(PASSPORT_RE)) {
    const value = m[1];
    // `{6,}` fixes the lower bound; the upper bound is enforced here so an
    // over-long run is rejected without the old quantifier's silent-drop cliff.
    if (value.length > MAX_LEN) continue;
    const start = m.index + (m[0].length - value.length);
    spans.push({
      start,
      end: start + value.length,
      type: 'PASSPORT',
      text: value,
      confidence: 0.8,
      source: 'passport',
    });
  }
  return spans;
}
