import type { Span } from '../../types';

// Candidate runs: an optional leading '+', then digits and common separators.
const PHONE_RE = /(?<![\w+])\+?\d[\d().\-/ ]{5,}\d(?![\w])/g;

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
    spans.push({
      start,
      end: start + trimmed.length,
      type: 'PHONE',
      text: trimmed,
      confidence: 0.6,
      source: 'phone',
    });
  }
  return spans;
}
