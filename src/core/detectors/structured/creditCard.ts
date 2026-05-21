import type { Span } from '../../types';

const CARD_RE = /(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])/g;

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

export function detectCreditCards(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(CARD_RE)) {
    const value = match[0];
    const digits = value.replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19) continue;
    if (!isValidLuhn(digits)) continue;
    // Require grouping or a known length to avoid flagging long plain integers.
    const grouped = /[ -]/.test(value);
    if (!grouped && digits.length !== 15 && digits.length !== 16) continue;
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
