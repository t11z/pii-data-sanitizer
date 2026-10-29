import type { Span } from '../../types';
import { precededByRefMarker } from './refMarker';

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
//
// The DMY/MDY (year-last) branch captures its two leading fields so they can be
// calendar-range-checked in {@link isDateShaped}. The bare shape alone is not
// enough: an international phone written with a country code and hyphen grouping
// ("91-11-4567-8901", "44-20-7946-0958", "33-1-4070-1234") is structurally
// identical to DD-MM-YYYY plus a trailing sequence, and the un-ranged shape
// swallowed all of them. A leading group above 31 (or a middle group above 31)
// cannot be any calendar day/month, so those runs are phones, not dates.
const DATE_SHAPE =
  /^(?:\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}|(\d{1,2})[.\-/](\d{1,2})[.\-/]\d{4})(?:[.\-/]\d{1,4})?(?:[ T]\d{1,2}(?::\d{2}){0,2})?$/;

/**
 * True when `s` is a calendar date (or date-prefixed timestamp / ref), so the
 * phone detector should skip it. The ISO (year-first) branch is always a date.
 * The DMY/MDY (year-last) branch only counts when its two leading fields fit a
 * real date under some orientation — day 1-31 and month 1-12 — i.e. both ≤ 31
 * and at least one ≤ 12. Otherwise the run is a hyphen-grouped phone that merely
 * resembles a year-last date and must fall through to detection.
 */
function isDateShaped(s: string): boolean {
  const m = DATE_SHAPE.exec(s);
  if (!m) return false;
  // ISO / year-first branch: the two capture groups are undefined.
  if (m[1] === undefined) return true;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a >= 1 && b >= 1 && a <= 31 && b <= 31 && (a <= 12 || b <= 12);
}

// A near-miss IPv4 address: four dot-separated groups of 1–3 digits with at
// least one octet above 255. A valid dotted quad is claimed by the IP detector
// and overlap-resolved away from PHONE, but an out-of-range one ("10.0.0.299",
// "192.168.0.256") is rejected there and falls through to here — dotted and
// four-grouped, it trips the phone "grouping" signal below. It is a botched
// address, never a phone: genuine dotted phone groupings never take the form of
// four 1–3-digit groups with an octet exceeding 255.
const IPV4_QUAD = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function isNearMissIpv4(s: string): boolean {
  const m = IPV4_QUAD.exec(s);
  return m !== null && m.slice(1).some((oct) => Number(oct) > 255);
}

// Compact-date reference: a solid 8-digit ISO date "YYYYMMDD" followed by a
// separator and a short sequence number ("ticket ID 20260908-001",
// "Case 20260908-042"). The date block carries no internal separators, so
// DATE_SHAPE above (which anchors on separated date components) never sees it,
// and the trailing "-NNN" supplies the hyphen that reads as phone grouping.
// The leading eight digits only count when they parse as a real calendar date
// (year 1900–2099, month 01–12, day 01–31) — that validity gate is what keeps
// the guard from swallowing genuine numbers, since no real phone begins with a
// valid YYYYMMDD block glued to a hyphenated sequence.
const COMPACT_DATE_REF = /^(\d{4})(\d{2})(\d{2})[.\-/]\d{1,4}$/;

export function isCompactDateRef(candidate: string): boolean {
  const m = COMPACT_DATE_REF.exec(candidate);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return year >= 1900 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

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
    //
    // A run beginning "00" is the ITU-T E.123 international call prefix: the
    // plus-less form of a `+CC` number ("0049 30 12345678" == "+49 30 …",
    // "0044 20 7946 0958" == "+44 …"). Its leading group is 4 digits for the
    // many 2-digit country codes (0049, 0044, 0033, 0039, 0034, 0081, …), which
    // would otherwise read as a 4-4-… card layout and be dropped here. It can
    // never be a card — ISO/IEC 7812-1 reserves MII 0, so no PAN starts with 0 —
    // so the international prefix is exempt from the card-shape gate, like `+`.
    const intlPrefix = digits.startsWith('00');
    if (digits.length >= 13 && !intlPrefix && !/[+()\-./]/.test(value)) {
      const groups = value.trim().split(/\s+/);
      if (groups.length === 1 || groups[0].length === 4) continue;
    }
    // Skip date-shaped candidates: bare dates, ISO timestamps, and
    // invoice/case refs suffixed with a short sequence number. The year-last
    // branch is calendar-range-checked so hyphen-grouped international phones
    // (leading country code > 31) are not mistaken for DD-MM-YYYY.
    if (isDateShaped(trimmed)) continue;
    // Skip out-of-range dotted quads: a botched IPv4 address the IP detector
    // rejected, not a phone number.
    if (isNearMissIpv4(trimmed)) continue;
    // Skip compact "YYYYMMDD-NNN" date-prefixed references (ticket / case IDs).
    if (isCompactDateRef(trimmed)) continue;
    // Skip digit runs embedded in an alphanumeric identifier (order/ticket/
    // invoice/serial numbers like "ORD-2025-001847-X") — not phone numbers.
    if (fusedToLetters(text, start, end)) continue;
    // Skip runs marked as a case/ticket/order reference ("Case #567-89-1234",
    // "№ 12 345 678") — the '#'/'№' marker makes it an identifier, not a phone.
    if (precededByRefMarker(text, start)) continue;
    // Re-balance a leading area-code parenthesis. The candidate run starts at the
    // first digit, so "(212) 555-0199" matches as "212) 555-0199": the inner ')'
    // that closes the area code is captured (digits follow it) but its opening '('
    // sits one char before the match. When the span carries an unmatched trailing
    // ')' and a '(' immediately precedes it, pull that '(' in so the span is
    // balanced and redaction leaves no orphan '('. (The bare "(5551234567)" shape
    // has no interior ')' — its closing paren trails the last digit and is never
    // captured — so it is untouched here.)
    let spanStart = start;
    let spanText = trimmed;
    const unmatchedClose =
      (spanText.match(/\)/g)?.length ?? 0) > (spanText.match(/\(/g)?.length ?? 0);
    if (unmatchedClose && text[spanStart - 1] === '(') {
      spanStart -= 1;
      spanText = '(' + spanText;
    }
    spans.push({
      start: spanStart,
      end,
      type: 'PHONE',
      text: spanText,
      confidence: 0.6,
      source: 'phone',
    });
  }
  return spans;
}
