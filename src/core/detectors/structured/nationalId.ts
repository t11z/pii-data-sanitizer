import type { Span } from '../../types';

// National identification numbers. Each branch is gated by a structural/checksum
// rule so a bare digit run is never flagged as an ID on length alone.

// --- US Social Security Number (SSN) -------------------------------------------------
// Dashed form only (AAA-GG-SSSS). Bare 9-digit runs are far too ambiguous to claim as
// SSNs, so we require the canonical separators and validate the SSA allocation rules.
const SSN_RE = /\b(\d{3})-(\d{2})-(\d{4})\b/g;

function isValidSsn(area: string, group: string, serial: string): boolean {
  // Never-assigned areas: 000, 666, and 900–999 (used for ITINs / reserved ranges).
  if (area === '000' || area === '666' || area[0] === '9') return false;
  if (group === '00') return false;
  if (serial === '0000') return false;
  return true;
}

// --- German tax ID (Steuerliche Identifikationsnummer) -------------------------------
// 11 digits validated by ISO 7064 MOD 11,10 plus the BZSt structural rule, which makes
// a false positive on an arbitrary 11-digit run (e.g. a phone number) very unlikely.
const TAX_ID_RE = /\b\d{11}\b/g;

/** ISO 7064 MOD 11,10 check digit over the first 10 digits. */
function taxIdCheckDigit(first10: string): number {
  let product = 10;
  for (const ch of first10) {
    let sum = (ch.charCodeAt(0) - 48 + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  return (11 - product) % 10;
}

/**
 * BZSt structure: within the first 10 digits exactly one digit occurs two or three
 * times and every other digit occurs at most once (and no leading zero).
 */
function hasValidTaxIdStructure(first10: string): boolean {
  if (first10[0] === '0') return false;
  const counts = new Map<string, number>();
  for (const ch of first10) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let repeated = 0;
  for (const n of counts.values()) {
    if (n > 3) return false;
    if (n >= 2) repeated++;
  }
  return repeated === 1;
}

function isValidGermanTaxId(digits: string): boolean {
  const first10 = digits.slice(0, 10);
  if (!hasValidTaxIdStructure(first10)) return false;
  return taxIdCheckDigit(first10) === digits.charCodeAt(10) - 48;
}

export function detectNationalIds(text: string): Span[] {
  const spans: Span[] = [];

  for (const m of text.matchAll(SSN_RE)) {
    if (!isValidSsn(m[1], m[2], m[3])) continue;
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      type: 'NATIONAL_ID',
      text: m[0],
      confidence: 0.92,
      source: 'ssn',
    });
  }

  for (const m of text.matchAll(TAX_ID_RE)) {
    if (!isValidGermanTaxId(m[0])) continue;
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      type: 'NATIONAL_ID',
      text: m[0],
      confidence: 0.9,
      source: 'tax-id-de',
    });
  }

  return spans;
}
