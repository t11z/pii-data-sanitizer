import type { Span } from '../../types';

// Candidate runs: an optional leading '+', then digits and common separators.
const PHONE_RE = /(?<![\w+])\+?\d[\d().\-/ ]{5,}\d(?![\w])/g;

const ID_CHAR = /[A-Za-z0-9_-]/;
const LETTER = /[A-Za-z]/;

// A dotted-quad IPv4 address with a trailing CIDR suffix ("172.16.0.0/12",
// "198.51.100.0/24") is never a phone number — real numbers don't carry a
// bare `/N` suffix. Overlap resolution normally lets the higher-confidence IP
// span shadow this candidate, but the IP detector intentionally does not emit
// a span for a CIDR network-base address (all host bits zero), so this needs
// its own structural guard rather than relying on that suppression.
const CIDR_IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/\d{1,2}$/;

// ISO-8601 date or the leading date-plus-hour of a timestamp. The candidate
// regex stops at ':' (not a separator), so a timestamp like
// "2026-03-17 14:08:51" surfaces as the candidate "2026-03-17 14" — a date,
// not a phone. No real phone number starts with a YYYY-MM-DD block, so dropping
// these is safe for genuine numbers.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}(?::\d{2}){0,2})?$/;

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
    // Skip ISO dates / timestamps (e.g. "2026-03-17" or "2026-03-17 14").
    if (ISO_DATE.test(trimmed)) continue;
    // Skip CIDR-tagged IPv4 addresses (e.g. "172.16.0.0/12").
    if (CIDR_IPV4_RE.test(trimmed)) continue;
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
