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
// Between the cue word and the number, forms and records commonly insert a
// document-type noun ("passport document V…", "passport book number V…", German
// "Reisepass Dokument V…"). That noun is accepted as an optional connector so the
// whole "<cue> <document-noun> [No./Number] <value>" phrasing class is covered — not a
// single memorized value. It stays precision-safe because the number token below is
// still required to be an uppercase, digit-bearing 6–12 char run, so a trailing prose
// word ("passport document scanned") can never be mistaken for a number.
const DOC_NOUN = String.raw`(?:\s+(?:[Dd]ocument|[Dd]oc\.?|[Dd]okument|[Dd]ok\.?|[Bb]ook(?:let)?))?`;
const CUE = String.raw`(?:[Pp]assport|[Rr]eisepass|[Pp]assnummer)${DOC_NOUN}(?:\s*(?:[Nn]o\.?|[Nn]umber|[Nn]r\.?|#))?`;
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
