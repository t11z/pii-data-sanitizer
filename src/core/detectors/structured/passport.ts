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
//
// The base word and its abbreviation are joined by an optional `\s*-?\s*` connector, not
// just whitespace: German (and English) routinely hyphenate the compound — "Reisepass-Nr.",
// "Pass-Nr.", "Passport-No.". With whitespace-only, the hyphen fell outside the optional
// abbreviation group, so the group matched nothing and the following `-Nr. NUMBER` no longer
// lined up against the required separator, dropping the whole match. Allowing a single hyphen
// covers the entire hyphenated-compound class without loosening the strict, digit-bearing
// number gate that guards precision.
//
// The connector alternation lists the closed set of label words that separate the cue
// from the number. `Num`/`Num.` is the common English abbreviation of "Number" (as in
// "Passport Num. E9X5K2B"); it is distinct from `No.`/`Nr.` and was previously dropped,
// so the number token then tried to match the lowercase word "Num" — which has no digit
// and fails the digit-bearing NUMBER requirement — and the whole match failed. `[Nn]umber`
// stays first so the full word is preferred over the abbreviation. The connector is
// optional and the digit-bearing uppercase token remains required, so widening it here
// covers the whole "Passport Num[.] X" class for any value without touching precision.
//
// The optional connector after the base cue absorbs the label word that often
// sits between "passport" and the value. "No./Number/Nr./#" are the classic ones;
// "Code"/"ID" are just as common in forms and customs records ("passport code X",
// "passport ID: X") and were silently dropping those numbers, because the connector
// is optional and the following lowercase label was then consumed as the (failed)
// number token. Listing the label words keeps the cue strict while covering the class.
//
// "document" joins the qualifier list because "passport document <number>" is as common
// a lead-in as "passport no.".
const CUE = String.raw`(?:[Pp]assport|[Rr]eisepass|[Pp]assnummer)${DOC_NOUN}(?:\s*-?\s*(?:[Nn]umber|[Nn]um\.?|[Nn]o\.?|[Nn]r\.?|[Rr]eference|[Rr]ef\.?|[Cc]ode|[Ii][Dd]|#|[Dd]ocument))?`;
// A passport number is very often printed with its two-letter issuing-country code in
// front ("Passport IN K4759632", "Passnummer IR 98765432"). That code has no digit, so
// the old regex — which only inspected the token immediately after the cue — matched the
// bare country code against NUMBER, failed the `\d` lookahead, and dropped the whole
// entry. We now let an optional `AA ` prefix be consumed (but not captured) so the number
// itself is what we claim. It stays optional, so the bare "Passport <number>" form is
// unchanged, and the required cue keeps this from firing on arbitrary "XX <token>" text.
const ISSUER = String.raw`(?:[A-Z]{2}\s+)?`;
const NUMBER = String.raw`((?=[A-Z0-9]*\d)[A-Z0-9]{6,})\b`;
// Separator between the cue and the number: either whitespace, or a `:`/`#`
// marker (optionally space-padded). Letting `:`/`#` *be* the separator — rather
// than forcing a trailing space — captures the glued forms writers actually use
// ("Reisepass #DE8A5N2V7R", "Passport#XY987654", "Passport:X1234567"), which the
// whitespace-only separator dropped entirely (the `#` was consumed as a cue
// marker, then no space followed the number, so the whole match failed). Some
// separator/marker is still required, so a cue with no number ("passport please")
// cannot match.
// `#` also stays in the CUE connector set above, so the spaced "Passport #: X"
// form that worked before keeps matching.
const SEP = String.raw`(?:\s*[:#]\s*|\s+)`;
const PASSPORT_RE = new RegExp(`${CUE}${SEP}${ISSUER}${NUMBER}`, 'g');

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
