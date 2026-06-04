import type { Span } from '../../types';

// The country code and check digits may be separated by a single space when
// IBANs are printed in pairs (e.g. "IT 60 X054 ...", "DE 89 3704 ..."). The
// mod-97 check below still gates whether a match is reported, so the looser
// pattern cannot leak random "XX 12 …" strings as IBANs.
const IBAN_RE = /\b[A-Z]{2}[ ]?\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/g;

// Official IBAN length per country, from the SWIFT IBAN Registry. Mod-97 alone
// passes ~1% of random strings by chance, so a longer-than-canonical run that
// happens to checksum-validate (e.g. a 32-char "BR15 …" with extra zero groups
// glued on) would otherwise leak as an IBAN. Requiring the compact length to
// match the country's registered length is structural — it generalizes to every
// possible IBAN shape, not the specific value that triggered the gap. Unknown
// country codes fall through (mod-97 alone), preserving recall on jurisdictions
// not yet in the registry.
const IBAN_LENGTH_BY_COUNTRY: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
};

/** ISO 7064 mod-97-10 check: a valid IBAN yields a remainder of 1. */
export function isValidIban(raw: string): boolean {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;
  // Country-length gate: if the country is registered, the compact length must
  // match exactly. Random suffixes/prefixes that happen to mod-97 pass (1 in 97)
  // can still match the regex but will fail this check.
  const cc = compact.slice(0, 2);
  const expected = IBAN_LENGTH_BY_COUNTRY[cc];
  if (expected !== undefined && compact.length !== expected) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= 'A' && ch <= 'Z' ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const digit of code) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

export function detectIbans(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(IBAN_RE)) {
    const value = match[0];
    if (!isValidIban(value)) continue;
    spans.push({
      start: match.index,
      end: match.index + value.length,
      type: 'IBAN',
      text: value,
      confidence: 0.97,
      source: 'iban',
    });
  }
  return spans;
}
