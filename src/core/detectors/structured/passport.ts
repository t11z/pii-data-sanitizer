import type { Span } from '../../types';

// Passport numbers have no universal checksum and vary by country, so a bare
// alphanumeric token can't be claimed as one. We require an explicit "passport"
// (or German "Reisepass"/"Passnummer") cue, then take the following 6–12 character
// uppercase alphanumeric token that contains at least one digit.
//
// The upper bound is 12, not 9: while the ICAO MRZ document-number field maxes at
// nine, plenty of national schemes print longer human-readable numbers (e.g. 10-char
// alphanumerics). Capping at 9 silently dropped every longer number — and because the
// token is followed by `\b`, a 10-char value didn't even partial-match, it failed
// outright. The generous bound is safe precisely because the cue is required.
//
// The case is kept strict (uppercase) on purpose — without the `i` flag a lowercase
// word after the cue ("passport please") can't be mistaken for a number. Cue casing is
// handled with explicit leading-character classes instead.
//
// The base word and its abbreviation are joined by an optional `\s*-?\s*` connector, not
// just whitespace: German (and English) routinely hyphenate the compound — "Reisepass-Nr.",
// "Pass-Nr.", "Passport-No.". With whitespace-only, the hyphen fell outside the optional
// abbreviation group, so the group matched nothing and the following `-Nr. NUMBER` no longer
// lined up against the required separator, dropping the whole match. Allowing a single hyphen
// covers the entire hyphenated-compound class without loosening the strict, digit-bearing
// number gate that guards precision.
const CUE = String.raw`(?:[Pp]assport|[Rr]eisepass|[Pp]assnummer)(?:\s*-?\s*(?:[Nn]o\.?|[Nn]umber|[Nn]r\.?|#))?`;
const NUMBER = String.raw`((?=[A-Z0-9]*\d)[A-Z0-9]{6,12})\b`;
const PASSPORT_RE = new RegExp(`${CUE}(?:\\s*:\\s*|\\s+)${NUMBER}`, 'g');

export function detectPassports(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(PASSPORT_RE)) {
    const value = m[1];
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
