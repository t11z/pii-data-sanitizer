import type { Span } from '../../types';

// The country code and check digits may be separated by a single space when
// IBANs are printed in pairs (e.g. "IT 60 X054 ...", "DE 89 3704 ..."). The
// mod-97 check below still gates whether a match is reported, so the looser
// pattern cannot leak random "XX 12 …" strings as IBANs.
const IBAN_RE = /\b[A-Z]{2}[ ]?\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/g;

/** ISO 7064 mod-97-10 check: a valid IBAN yields a remainder of 1. */
export function isValidIban(raw: string): boolean {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;
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
