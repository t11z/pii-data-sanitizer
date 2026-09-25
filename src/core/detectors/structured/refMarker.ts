// A reference marker — '#' or its European equivalent '№' — immediately preceding a
// digit run marks it as a case / ticket / order / bug / invoice identifier, never a
// piece of personal PII. Support desks and issue trackers write "Case #567-89-1234",
// "Ticket № 345-67-8901", "Order #12 345 678". A structured-ID detector (SSN, phone)
// whose pattern would otherwise fire on the digits must defer to this marker: it is a
// pure structural signal, independent of the label's language or the identifier scheme.

/**
 * True when `start` is immediately preceded by a '#' or '№' reference marker, allowing
 * only horizontal whitespace ("Case # 567-89-1234") between the marker and the run.
 */
export function precededByRefMarker(text: string, start: number): boolean {
  let i = start - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  return i >= 0 && (text[i] === '#' || text[i] === '№');
}

// The textual analog of the '#'/'№' marker above: a *word* label that introduces a
// machine identifier rather than a person's contact number. "build ID 77-1234567890",
// "Serial 88-9900112233", "Batch 90-1122334455" are asset/version/reference tokens, not
// phones — but they are hyphen-grouped digit runs, so the phone detector's grouping
// signal fires on them. This guard is a closed, curated cue list (not a broad regex): a
// candidate immediately introduced by one of these labels is suppressed. Two shapes are
// recognised, both requiring the label to sit directly before the run (small char
// budget, no sentence crossing):
//   1. a standalone identifier noun — "serial", "firmware", "build", "batch", …
//   2. a generic label word ("id"/"no"/"number"/"code") qualified by a non-phone noun —
//      "build ID", "device number", "order no", "asset code".
// The qualifier gate is what keeps genuine phones alive: "caller ID +1 …", "contact
// number …", "mobile no …" are NOT suppressed because "caller"/"contact"/"mobile" are
// phone words, not identifier qualifiers.
const IDENTIFIER_NOUNS: ReadonlySet<string> = new Set([
  'serial',
  'firmware',
  'hardware',
  'build',
  'revision',
  'rev',
  'version',
  'ver',
  'sku',
  'batch',
  'lot',
  'checksum',
  'hash',
  'uuid',
  'guid',
  'imei',
]);
const LABEL_WORDS: ReadonlySet<string> = new Set([
  'id',
  'ids',
  'no',
  'num',
  'number',
  'code',
  'identifier',
]);
const IDENTIFIER_QUALIFIERS: ReadonlySet<string> = new Set([
  'build',
  'device',
  'session',
  'order',
  'batch',
  'transaction',
  'trace',
  'correlation',
  'request',
  'process',
  'job',
  'node',
  'config',
  'cluster',
  'tenant',
  'ticket',
  'case',
  'invoice',
  'product',
  'asset',
  'record',
  'serial',
  'firmware',
  'hardware',
  'software',
  'machine',
  'host',
  'server',
  'license',
  'licence',
  'customer',
  'account',
  'user',
  'member',
  'client',
  'employee',
  'subscriber',
]);

// Keep the lookback tight so the label must actually introduce the run — never reach
// back across a sentence for a coincidental word.
const IDENTIFIER_LOOKBACK = 30;

/** Read the alphabetic word ending at or before `from`, skipping any non-letter
 * separators (space, ':', '(', '.', '-'). Returns the lowercased word and the index of
 * the character just before it, or `null` when none is found within the budget. */
function alphaWordBefore(
  text: string,
  from: number,
  budget: number
): { word: string; prev: number } | null {
  let i = from;
  const floor = Math.max(-1, from - budget);
  while (i > floor && !/[A-Za-z]/.test(text[i])) i--;
  if (i <= floor && !/[A-Za-z]/.test(text[i])) return null;
  if (!/[A-Za-z]/.test(text[i])) return null;
  const end = i;
  while (i >= 0 && /[A-Za-z]/.test(text[i])) i--;
  return { word: text.slice(i + 1, end + 1).toLowerCase(), prev: i };
}

/**
 * True when the digit run at `start` is immediately introduced by an identifier label
 * word ("Serial 88-…") or a qualified label phrase ("build ID 77-…", "order no 55-…"),
 * marking it as a machine/reference identifier rather than a phone. Genuine phone
 * introducers ("caller ID", "contact number", "mobile no") are preserved because their
 * qualifier is not in {@link IDENTIFIER_QUALIFIERS}.
 */
export function precededByIdentifierLabel(text: string, start: number): boolean {
  const w1 = alphaWordBefore(text, start - 1, IDENTIFIER_LOOKBACK);
  if (!w1) return false;
  if (IDENTIFIER_NOUNS.has(w1.word)) return true;
  if (!LABEL_WORDS.has(w1.word)) return false;
  // A bare label word ("ID", "No.") only counts when a non-phone identifier noun
  // qualifies it — otherwise "caller ID +1 …" would be lost.
  const w2 = alphaWordBefore(text, w1.prev, IDENTIFIER_LOOKBACK);
  return !!w2 && IDENTIFIER_QUALIFIERS.has(w2.word);
}
