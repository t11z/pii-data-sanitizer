import type { Span } from '../../types';

// Candidate runs: an optional leading '+', then digits and common separators.
const PHONE_RE = /(?<![\w+])\+?\d[\d().\-/ ]{5,}\d(?![\w])/g;

const ID_CHAR = /[A-Za-z0-9_-]/;
const LETTER = /[A-Za-z]/;

/**
 * True when the digit run is fused — across hyphens or underscores — to letters,
 * i.e. it is part of a structured reference (order #, ticket, invoice, serial,
 * SKU) rather than a phone number. The candidate regex stops at word characters
 * but not at '-', so the "2025-001847" inside "ORD-2025-001847-X" still matches;
 * this guard drops it. Real phones use internal hyphens but are never glued to
 * alphabetic neighbours at their outer boundary.
 */
function fusedToLetters(text: string, start: number, end: number): boolean {
  for (let i = start - 1; i >= 0 && ID_CHAR.test(text[i]); i--) {
    if (LETTER.test(text[i])) return true;
  }
  for (let j = end; j < text.length && ID_CHAR.test(text[j]); j++) {
    if (LETTER.test(text[j])) return true;
  }
  return false;
}

export function detectPhones(text: string): Span[] {
  const spans: Span[] = [];
  for (const match of text.matchAll(PHONE_RE)) {
    const value = match[0];
    const digits = value.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    // Require a clear phone signal (international prefix or grouping) so plain
    // numbers/IDs are not swept up.
    const hasSignal = value.trimStart().startsWith('+') || /[().\-/ ]/.test(value);
    if (!hasSignal) continue;
    const start = match.index + (value.length - value.trimStart().length);
    const trimmed = value.trim();
    const end = start + trimmed.length;
    // Skip digit runs embedded in an alphanumeric identifier (order/ticket/
    // invoice/serial numbers like "ORD-2025-001847-X") — not phone numbers.
    if (fusedToLetters(text, start, end)) continue;
    spans.push({
      start,
      end,
      type: 'PHONE',
      text: trimmed,
      confidence: 0.6,
      source: 'phone',
    });
  }
  return spans;
}
