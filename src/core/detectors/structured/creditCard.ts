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

// Masked-card references: support / fraud / TAC prose routinely cites only a
// card's last four digits ("card ending in 4242", "Visa ending 1881"). Those
// four digits are the printed, customer-facing identifier of the card and are
// PII, but a bare 4-digit run ("suite 4242", "ext 1881") is far too common to
// flag on its own. We gate strictly on an explicit card-masking cue: a card
// noun (the word "card" or a payment-network name) immediately followed by
// "ending" — with an optional "no./number/#" filler and an optional "in"/"with"
// — right before the digits. This closes the whole "<card> ending [in] NNNN"
// class regardless of the specific number, while leaving unrelated 4-digit
// tokens untouched. Confidence sits below a full PAN: it is a partial value,
// certain-in-context but only four digits.
const MASKED_LAST4_RE =
  /\b(?:card|visa|mastercard|amex|american express|discover|maestro|unionpay|jcb|diners)\b[ \t]*(?:card|no\.?|number|#)?[ \t]*ending\b(?:[ \t]+(?:in|with))?[ \t]*[:#]?[ \t]*(\d{4})(?!\d)/gi;

function detectMaskedLast4(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(MASKED_LAST4_RE)) {
    const digits = match[1];
    const start = match.index + match[0].length - digits.length;
    spans.push({
      start,
      end: start + digits.length,
      type: 'CREDIT_CARD',
      text: digits,
      confidence: 0.6,
      source: 'creditCard',
    });
  }
  return spans;
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
    const grouped = /[ -]/.test(value);
    if (!grouped && digits.length !== 15 && digits.length !== 16) continue;
    if (grouped && !hasNetworkGrouping(value)) continue;
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
  spans.push(...detectMaskedLast4(text));
  return spans;
}
