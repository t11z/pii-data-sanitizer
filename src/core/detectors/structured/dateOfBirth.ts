import type { Span } from '../../types';

// A date is only treated as a date of birth when an explicit birth cue precedes it.
// Plain dates (timestamps, expiry dates, appointments) are intentionally NOT flagged —
// gating on the cue keeps precision high in logs and tickets full of incidental dates.

const CUE = String.raw`(?:date\s+of\s+birth|d\.?\s*o\.?\s*b\.?|born(?:\s+on)?|geburtsdatum|geboren(?:\s+am)?|geb\.?)`;

const MONTH_EN = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?`;
const MONTH_DE = String.raw`(?:januar|februar|m[äa]rz|april|mai|juni|juli|august|september|oktober|november|dezember)`;
const MONTH = `(?:${MONTH_EN}|${MONTH_DE})`;
const DAY = String.raw`\d{1,2}(?:st|nd|rd|th)?`;
const YEAR = String.raw`\d{2,4}`;

// Date forms: ISO, numeric DD.MM.YYYY / MM/DD/YYYY, "Month D, YYYY", "D Month YYYY",
// and the German "D. Month YYYY".
const DATE = [
  String.raw`\d{4}-\d{1,2}-\d{1,2}`,
  String.raw`\d{1,2}[./]\d{1,2}[./]\d{2,4}`,
  `${MONTH}\\s+${DAY},?\\s+${YEAR}`,
  `${DAY}\\.?\\s+${MONTH},?\\s+${YEAR}`,
].join('|');

// Between the cue and the date, support-desk prose commonly slips a short
// connective phrase: "DOB on file: …", "date of birth recorded as …",
// "DOB listed as …". Allow up to three short alphabetic filler tokens (each
// optionally closed by a colon) so the cue still binds the date across them.
// The bound is deliberately tight — three words, no digits, no sentence
// punctuation — so the date stays adjacent to its cue and an unrelated date
// further down the sentence can't be bridged in. The cue gate itself already
// keeps incidental dates out.
const FILLER = String.raw`(?:[a-z]{2,10}[\s:]+){0,3}`;

// Cue, then a colon / whitespace / short connective run, then the date (the date
// is the trailing capture group so its offset is the match end minus its own length).
const DOB_RE = new RegExp(`${CUE}(?:\\s*:\\s*|\\s+${FILLER})(${DATE})`, 'gi');

export function detectDatesOfBirth(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(DOB_RE)) {
    const date = m[1];
    const start = m.index + (m[0].length - date.length);
    spans.push({
      start,
      end: start + date.length,
      type: 'DATE_OF_BIRTH',
      text: date,
      confidence: 0.85,
      source: 'dob',
    });
  }
  return spans;
}
