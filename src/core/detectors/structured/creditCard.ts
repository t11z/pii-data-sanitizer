import type { Span } from '../../types';
import { IBAN_LENGTH_BY_COUNTRY } from './iban';

const CARD_RE = /(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])/g;

// A CC candidate that immediately follows a printed IBAN's first group is a
// substring of an IBAN body, not a payment card. When the IBAN itself fails
// mod-97 / country-length (mis-keyed, OCR-corrupted, non-standard groupings),
// no IBAN span emits and the overlap resolver cannot shield the cascade FP —
// see `bench/corpus.json` for the cued-IBAN companion cases where the IBAN
// span DOES emit and shielding works. This guard closes the uncued class:
// an ISO IBAN country code followed by its check digits (and optionally the
// first BBAN chars) up to a separator, immediately before the candidate.
// The letters must belong to `IBAN_LENGTH_BY_COUNTRY` so arbitrary 2-letter
// prefixes ("ISO9001 …", "PO12345 …") are not affected.
const IBAN_PREFIX_LOOKBACK = 12;
function precededByIbanBodyPrefix(text: string, start: number): boolean {
  const lookback = Math.max(0, start - IBAN_PREFIX_LOOKBACK);
  const before = text.slice(lookback, start);
  const match = before.match(/(?:^|[^A-Za-z0-9])([A-Z]{2})\d{2,4}[ -]$/);
  if (!match) return false;
  return match[1] in IBAN_LENGTH_BY_COUNTRY;
}

/** Luhn (mod-10) checksum. */
export function isValidLuhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// Payment networks define a small, canonical set of print groupings for PANs:
// 4-4-4-4 (Visa/MC/Discover/JCB/UnionPay 16), 4-4-4-3 (Maestro/UATP 15), 4-6-5
// (Amex 15), 4-6-4 (Diners Club 14), and 4-4-4-4-3 (Maestro/UnionPay 19). Any
// other grouping in prose — e.g. 4-3-7 inside an IBAN's irregular spacing
// ("IBAN ES… 4300 001 1874756") — is a Luhn-collision inside an unrelated
// structured token, not an actual card. Enforcing the grouping closes that
// whole class of FPs without touching real cards, since networks always print
// in these widths.
const NETWORK_GROUPINGS: ReadonlySet<string> = new Set([
  '4-4-4-4',
  '4-4-4-3',
  '4-6-5',
  '4-6-4',
  '4-4-4-4-3',
]);

function hasNetworkGrouping(value: string): boolean {
  const sizes = value
    .split(/[ -]+/)
    .filter((g) => g.length > 0)
    .map((g) => g.length);
  return NETWORK_GROUPINGS.has(sizes.join('-'));
}

// A payment card is ultimately defined by its Issuer Identification Number
// (ISO/IEC 7812 IIN ranges) plus that network's fixed PAN length — not by how a
// human happened to space the digits. When a Luhn-valid run matches a known
// network signature, its cardness is already established, so we accept it even
// when the print grouping is non-canonical: an Amex typed "378282 246310005"
// (6-9) instead of the 4-6-5 "3782 822463 10005" is still a card. The
// canonical-grouping gate above still guards the *unknown*-network case, where
// spacing is the only structural signal separating a real card from a Luhn
// collision inside an unrelated token — so this relaxation adds real cards
// without widening that FP class (the run must match a specific IIN + exact
// length, tighter than the plain 15/16-digit rule the ungrouped path allows).
const NETWORK_SIGNATURES: ReadonlyArray<{ re: RegExp; lengths: ReadonlySet<number> }> = [
  { re: /^3[47]/, lengths: new Set([15]) }, // American Express
  { re: /^4/, lengths: new Set([13, 16, 19]) }, // Visa
  { re: /^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/, lengths: new Set([16]) }, // Mastercard
  { re: /^(6011|64[4-9]|65)/, lengths: new Set([16]) }, // Discover
  { re: /^35(2[89]|[3-8]\d)/, lengths: new Set([16]) }, // JCB
  { re: /^3(0[0-5]|095|6|[89])/, lengths: new Set([14]) }, // Diners Club
  { re: /^62/, lengths: new Set([16, 17, 18, 19]) }, // UnionPay
];

function matchesKnownNetwork(digits: string): boolean {
  return NETWORK_SIGNATURES.some((s) => s.lengths.has(digits.length) && s.re.test(digits));
}

export function detectCreditCards(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(CARD_RE)) {
    const value = match[0];
    const digits = value.replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19) continue;
    if (!isValidLuhn(digits)) continue;
    // ISO/IEC 7812-1 reserves MII 0 for ISO/TC 68 — no consumer payment network
    // (Visa, Mastercard, Amex, Discover, JCB, Diners, UnionPay, Maestro) issues
    // PANs starting with 0. A 0-prefixed Luhn-valid run (e.g. 16 zeros inside a
    // long structured token) is therefore never a card.
    if (digits[0] === '0') continue;
    // Require grouping or a known length to avoid flagging long plain integers.
    // A run whose IIN + length match a known network is a card regardless of how
    // its digits are spaced, so it bypasses the grouping/length shape gates (but
    // still clears Luhn, the 0-MII, and the IBAN-prefix guards).
    const grouped = /[ -]/.test(value);
    if (!matchesKnownNetwork(digits)) {
      if (!grouped && digits.length !== 15 && digits.length !== 16) continue;
      if (grouped && !hasNetworkGrouping(value)) continue;
    }
    if (precededByIbanBodyPrefix(text, match.index)) continue;
    spans.push({
      start: match.index,
      end: match.index + value.length,
      type: 'CREDIT_CARD',
      text: value,
      confidence: 0.95,
      source: 'creditCard',
    });
  }
  return spans;
}
