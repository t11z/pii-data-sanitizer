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
// "document" joins the qualifier list because "passport document <number>" is as common
// a lead-in as "passport no.".
const CUE = String.raw`(?:[Pp]assport|[Rr]eisepass|[Pp]assnummer)(?:\s*(?:[Nn]o\.?|[Nn]umber|[Nn]r\.?|#|[Dd]ocument))?`;
// A passport number is very often printed with its two-letter issuing-country code in
// front ("Passport IN K4759632", "Passnummer IR 98765432"). That code has no digit, so
// the old regex — which only inspected the token immediately after the cue — matched the
// bare country code against NUMBER, failed the `\d` lookahead, and dropped the whole
// entry. We now let an optional `AA ` prefix be consumed (but not captured) so the number
// itself is what we claim. It stays optional, so the bare "Passport <number>" form is
// unchanged, and the required cue keeps this from firing on arbitrary "XX <token>" text.
const ISSUER = String.raw`(?:[A-Z]{2}\s+)?`;
const NUMBER = String.raw`((?=[A-Z0-9]*\d)[A-Z0-9]{6,12})\b`;
const PASSPORT_RE = new RegExp(`${CUE}(?:\\s*:\\s*|\\s+)${ISSUER}${NUMBER}`, 'g');

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
