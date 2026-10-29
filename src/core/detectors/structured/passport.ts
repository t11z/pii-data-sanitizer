import type { Span } from '../../types';
import { isCountryCode } from '../../context/countryCodes';

// Passport numbers have no universal checksum and vary by country, so a bare
// alphanumeric token can't be claimed as one. We require an explicit "passport"
// (or German "Reisepass"/"Passnummer") cue, then take the following uppercase
// alphanumeric token that contains at least one digit and is 6–14 characters long.
//
// The detector is one small grammar rather than a growing list of special cases:
//
//   ANCHOR  [LABEL]{0,2}  SEP  [ISSUER]  NUMBER
//
// - ANCHOR is the only part that licenses a match; every other slot is optional
//   and closed-class, so widening a slot never lets a match start without the
//   "passport" word.
// - LABEL is a closed set of connector words that forms and tickets put between
//   the anchor and the value ("No.", "Number", "Num.", "Nr.", "Ref.", "Reference",
//   "Code", "ID", "#", and document-type nouns "document"/"Dokument"/"book"/
//   "booklet"). Up to two may be stacked ("Passport Ref No. X", "Passport Book
//   No.: X", "Passport Reference Number: X") and each may be hyphen-joined to what
//   precedes it ("Reisepass-Nr.", "Passport-Document No."). Listing them is what
//   keeps a following lowercase label from being tried as the (failing) number.
// - SEP is whitespace or a `:`/`#` marker, optionally space-padded, so the glued
//   forms writers use ("Reisepass #DE8A5N2V7R", "Passport:X1234567") match too.
// - ISSUER is an optional 2–3 letter issuing-country prefix ("Passport GB 77213Q4",
//   "Passport: GBR 123456789"); see `detectPassports` for how it is masked.
// - NUMBER must be uppercase and digit-bearing, so prose after a cue ("passport
//   please", "passport document scanned") can never be mistaken for a number.
//
// Casing: there is no `i` flag on purpose — the NUMBER slot must stay uppercase.
// Cue words instead accept a capitalized or ALL-CAPS spelling via `word()`, which
// covers running prose and the upper-cased field labels of printed forms
// ("PASSPORT NO.: X") without loosening the number.
//
// Length: the upper bound is 14, not 9 or 12. The ICAO MRZ document-number field
// maxes at nine, but national schemes print longer human-readable numbers and some
// glue a two-letter issuing-country code straight onto the number ("IN2B3C4D5E6F7"),
// pushing a legitimate passport to 13 characters. The bound is validated in code
// rather than in the quantifier: a `{6,12}\b` quantifier cannot even partial-match a
// 13-char run (every interior position fails `\b`), so the whole entry was silently
// dropped — a recall cliff. The generous bound is safe because the anchor is required.
const MAX_LEN = 14;

/** "Word" or "WORD": capitalized/lowercase-initial or all-caps spelling of a cue word. */
function word(w: string): string {
  const head = w[0];
  return `(?:[${head.toUpperCase()}${head.toLowerCase()}]${w.slice(1)}|${w.toUpperCase()})`;
}

const ANCHOR = `(?:${word('passport')}|${word('reisepass')}|${word('passnummer')})`;

// Longer alternatives first where one is a prefix of another ("Number" before
// "Num", "Reference" before "Ref", "Booklet" before "Book"), so the full word is
// preferred; the required SEP after the labels still lets backtracking settle on
// whichever form actually precedes a number.
const LABEL = [
  word('number'),
  `${word('num')}\\.?`,
  `${word('no')}\\.?`,
  `${word('nr')}\\.?`,
  word('reference'),
  `${word('ref')}\\.?`,
  word('code'),
  '[Ii][Dd]',
  word('document'),
  `${word('doc')}\\.?`,
  word('dokument'),
  `${word('dok')}\\.?`,
  word('booklet'),
  word('book'),
  '#',
].join('|');

// The label separator is either a hyphen (with optional padding) or plain
// whitespace — never two adjacent `\s*` runs — so a long whitespace run has only
// one way to be split and matching stays linear instead of backtracking through
// every split point.
const LABELS = String.raw`(?:(?:\s*-\s*|\s+)?(?:${LABEL})){0,2}`;
const SEP = String.raw`(?:\s*[:#]\s*|\s+)`;
const ISSUER = String.raw`(?:([A-Z]{2,3})\s+)?`;
const NUMBER = String.raw`((?=[A-Z0-9]*\d)[A-Z0-9]{6,})\b`;
const PASSPORT_RE = new RegExp(`${ANCHOR}${LABELS}${SEP}${ISSUER}${NUMBER}`, 'g');

export function detectPassports(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(PASSPORT_RE)) {
    const issuer = m[1];
    const value = m[2];
    // `{6,}` fixes the lower bound; the upper bound is enforced here so an
    // over-long run is rejected without the old quantifier's silent-drop cliff.
    if (value.length > MAX_LEN) continue;
    const valueOffset = m[0].length - value.length;
    // A real ISO country code in the issuer slot is metadata about the document,
    // not part of the identifier, so only the number is claimed. Any other letter
    // group there ("Passport AB 1234567") is most plausibly the number's own prefix
    // printed with a space — claim it too rather than leave part of the identifier
    // visible after redaction. Only whitespace separates the issuer from the
    // number, so its last occurrence before the number is the captured one.
    const startOffset =
      issuer !== undefined && !isCountryCode(issuer)
        ? m[0].lastIndexOf(issuer, valueOffset)
        : valueOffset;
    const start = m.index + startOffset;
    const end = m.index + m[0].length;
    spans.push({
      start,
      end,
      type: 'PASSPORT',
      text: text.slice(start, end),
      confidence: 0.8,
      source: 'passport',
    });
  }
  return spans;
}
