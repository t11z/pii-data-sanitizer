import type { Span } from '../../types';

// Candidate runs: an optional leading '+', then digits and common separators.
const PHONE_RE = /(?<![\w+])\+?\d[\d().\-/ ]{5,}\d(?![\w])/g;

const ID_CHAR = /[A-Za-z0-9_-]/;
const LETTER = /[A-Za-z]/;

// ISO-8601 date or the leading date-plus-hour of a timestamp. The candidate
// regex stops at ':' (not a separator), so a timestamp like
// "2026-03-17 14:08:51" surfaces as the candidate "2026-03-17 14" — a date,
// not a phone. No real phone number starts with a YYYY-MM-DD block, so dropping
// these is safe for genuine numbers.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}(?::\d{2}){0,2})?$/;

// Closed-class phone-cue words that unambiguously introduce a phone number in
// support / business prose. Used as one leg of the paren-wrapped bare-run
// signal below — a bare 10–15-digit number in balanced parens is only accepted
// when preceded by one of these within a short window, so short numeric
// identifiers ("Reference (1234567890)") stay silent.
const PHONE_CUE_WORDS = new Set<string>([
  'call',
  'called',
  'calling',
  'calls',
  'phone',
  'phoned',
  'phones',
  'mobile',
  'cell',
  'cellular',
  'cellphone',
  'contact',
  'contacted',
  'contacts',
  'reach',
  'reached',
  'reachable',
  'dial',
  'dialed',
  'dialled',
  'ring',
  'rang',
  'tel',
  'telephone',
  'whatsapp',
  'sms',
  'text',
  'texted',
]);
const PHONE_CUE_WINDOW = 40;

/** True when a phone-cue word appears within {@link PHONE_CUE_WINDOW} characters
 * before `pos`. Word-boundary matching is case-insensitive; the window is small
 * enough that it does not cross a full sentence in practice. */
function hasPhoneCueBefore(text: string, pos: number): boolean {
  const from = Math.max(0, pos - PHONE_CUE_WINDOW);
  const window = text.slice(from, pos).toLowerCase();
  for (const match of window.matchAll(/[a-z]+/g)) {
    if (PHONE_CUE_WORDS.has(match[0])) return true;
  }
  return false;
}

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
    const trimmed = value.trim();
    const start = match.index + (value.length - value.trimStart().length);
    const end = start + trimmed.length;
    // Require a clear phone signal (international prefix or grouping) so plain
    // numbers/IDs are not swept up. A bare 10–15-digit run wrapped in balanced
    // parens `(N)` and preceded by a phone-cue word (call, phone, mobile, …)
    // also qualifies — that is the customary shape for a mobile written as
    // "customer called (9825551234) re:" in support prose. All three legs are
    // required together: the paren wrap by itself is too loose (any reference
    // number can wrap), the cue by itself is too loose (bare 10-digit IDs
    // near "call center id" would fire), and the 10-digit floor rules out
    // short ticket / invoice numbers.
    const wrappedInParens =
      start > 0 && end < text.length && text[start - 1] === '(' && text[end] === ')';
    const hasSignal =
      value.trimStart().startsWith('+') ||
      /[().\-/ ]/.test(value) ||
      (wrappedInParens &&
        digits.length >= 10 &&
        digits.length <= 15 &&
        hasPhoneCueBefore(text, start - 1));
    if (!hasSignal) continue;
    // Reject card-shaped digit groupings. ISO/IEC 7812-1 PANs are 13–19 digits.
    // A space-only digit run with ≥13 digits and a 4-digit leading group
    // (Visa/MC 4-4-4-4, AmEx 4-6-5, Diners 4-6-4, old Visa 4-4-4-1) is
    // structurally a card-style identifier, not a phone — every PAN layout
    // starts with four digits. A fused 13+ digit run with no grouping is
    // likewise identifier-shaped (bank account / reference number), never
    // phone-shaped. A Luhn-valid PAN is claimed by the credit-card detector
    // and overlap-resolved away from PHONE, but a Luhn-invalid PAN (synthetic
    // data, redacted-but-formatted card in a ticket) would otherwise leak
    // through here. A leading 1–3-digit group is the country-code-without-`+`
    // shape ("49 89 32156 7890", "33 1 4070 1234 5678") — common in support
    // prose where the user drops the plus — and must pass.
    if (digits.length >= 13 && !/[+()\-./]/.test(value)) {
      const groups = value.trim().split(/\s+/);
      if (groups.length === 1 || groups[0].length === 4) continue;
    }
    // Skip ISO dates / timestamps (e.g. "2026-03-17" or "2026-03-17 14").
    if (ISO_DATE.test(trimmed)) continue;
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
