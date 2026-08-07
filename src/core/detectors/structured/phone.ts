import type { Span } from '../../types';

// Candidate runs: an optional leading '+', then digits and common separators.
const PHONE_RE = /(?<![\w+])\+?\d[\d().\-/ ]{5,}\d(?![\w])/g;

const ID_CHAR = /[A-Za-z0-9_-]/;
const LETTER = /[A-Za-z]/;

// A date-shaped candidate: YYYY[.-/]MM[.-/]DD (ISO / dotted / slashed) or its
// DMY/MDY inversion, with an optional trailing sequence number
// ("invoice 2024.07.10-12", "ref 2024-11-08-7") and the leading date-plus-hour
// of an ISO timestamp. The PHONE_RE candidate stops at ':' (not a separator),
// so a timestamp like "2026-03-17 14:08:51" surfaces as "2026-03-17 14" — a
// date, not a phone. A four-digit block at one end is the tight anchor: real
// phones with a 4-digit component always sit next to at least one 3+-digit
// component, never two <=2-digit components, so no genuine phone shares this
// shape. Dropping these is safe for real numbers.
const DATE_SHAPE =
  /^(?:\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}|\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})(?:[.\-/]\d{1,4})?(?:[ T]\d{1,2}(?::\d{2}){0,2})?$/;

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
    const start = match.index + (value.length - value.trimStart().length);
    const trimmed = value.trim();
    const end = start + trimmed.length;
    // Skip date-shaped candidates: bare dates, ISO timestamps, and
    // invoice/case refs suffixed with a short sequence number.
    if (DATE_SHAPE.test(trimmed)) continue;
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
