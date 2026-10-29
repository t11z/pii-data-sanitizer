import type { Span } from '../../types';

// The country code and check digits may be separated by a single space when
// IBANs are printed in pairs (e.g. "IT 60 X054 ...", "DE 89 3704 ..."). The
// mod-97 check below still gates whether a match is reported, so the looser
// pattern cannot leak random "XX 12 …" strings as IBANs.
const IBAN_RE = /\b[A-Z]{2}[ ]?\d{2}(?:[ ]?[A-Z0-9]){10,30}\b/g;

// Cue-anchored path: the standalone word "IBAN" immediately precedes an IBAN-
// shaped run. The acronym is a near-deterministic intent signal — writers reach
// for "IBAN" only when declaring an account number — so it lets us emit a span
// even when the run fails mod-97 / country-length validation (mis-keyed,
// OCR-corrupted, or non-standard groupings). Captured group is the SHAPE only,
// not the cue word, so the span text mirrors what callers and the bench expect
// for a bare IBAN. The acronym itself is closed-class and almost never appears
// outside banking prose, so the cue does not leak in benign contexts; the
// uncued path remains strictly gated by mod-97 + length. This also overlap-
// shields the cascade FPs (PERSON "IBAN <CC>" — `iban` is a Basque given name
// in the ext dictionary — and CREDIT_CARD / PHONE matches on 4-digit groups
// inside the IBAN body) via the existing resolveOverlaps confidence ranking.
//
// Separator class also admits opening brackets/parens/braces: real prose
// routinely wraps the IBAN body right after the cue word ("IBAN (AE07 …)",
// "IBAN [DE89 …]", "IBAN {NL91 …}" in template contexts). Adding these to the
// class does not widen the precision surface because the IBAN shape after them
// is still required — `[A-Z]{2}\d{2}` + 10–30 alphanumeric groups does not
// occur incidentally in prose. Same reasoning admits `#` and `=` (declaration
// syntax: "IBAN #DE89 …", "IBAN=DE89 …").
//
// An optional, closed-class linking token between the cue word and the
// separator captures the natural-English constructions writers reach for in
// support/banking prose: "IBAN is …", "IBAN was …", "IBAN number …",
// "IBAN no. …", "IBAN reads …". These are the connectors this population uses,
// and confining the group to a small enumerated set (matched at most once) —
// rather than an arbitrary word run — means the shape gate stays load-bearing:
// prose without a real IBAN body after the linker (e.g. "IBAN is documented on
// the wiki", "IBAN was updated last week", "IBAN number is not visible") still
// fails to match. This is the safety-net path the source comment above
// describes; extending its trigger to natural prose is what makes the OCR /
// mis-keyed intent signal actually reachable on English tickets.
const IBAN_CUED_RE =
  /\bIBAN\b(?:\s+(?:is|was|number|no\.?|reads))?[\s:([{#=]+([A-Z]{2}[ ]?\d{2}(?:[ ]?[A-Z0-9]){10,30})\b/g;

// Second cue-anchored path: the *account-declaration* noun ("account", "acct",
// "a/c") — not the "IBAN" acronym — immediately preceding an IBAN-shaped run.
// Support/banking prose declares account numbers with this noun far more often
// than with the acronym ("Transfer to account: IT25 …", "bank account DE89 …"),
// so the acronym-only safety-net above misses the whole account-cued class of
// mis-keyed / OCR'd / templated IBANs whose only defect is a wrong mod-97 check
// digit. The optional linking token mirrors IBAN_CUED_RE's connectors; "holder"
// is deliberately absent because "Account holder <Name>" is followed by a person,
// never an IBAN body (see the `bench/corpus.json` account-holder guard cases).
// "account" is a looser cue than the closed-class "IBAN" acronym, so this path is
// gated harder than IBAN_CUED_RE: it bypasses mod-97 (the whole point — rescue a
// declared account with a bad check digit) but still requires a *registered*
// country code AND the exact registered compact length (`hasRegisteredIbanStructure`),
// which rejects arbitrary structured IDs ("account ID AB12CD34EF56GH78", unknown
// CC or wrong length) that the acronym path's shape-only gate would let through.
// The cue noun is matched case-insensitively via explicit classes; the IBAN
// SHAPE stays uppercase-only (no `i` flag) exactly like IBAN_CUED_RE, so the
// greedy `[A-Z0-9]` body stops at following lowercase prose instead of gluing
// trailing words ("DE… 78 before the next cycle") onto the captured run.
const IBAN_ACCOUNT_CUED_RE =
  /\b(?:[Aa]ccount|[Aa]cct\.?|[Aa]\/[Cc])(?:\s+(?:[Nn]umber|[Nn]o\.?|is|was|reads))?[\s:([{#=]+([A-Z]{2}[ ]?\d{2}(?:[ ]?[A-Z0-9]){10,30})\b/g;

// Explicit invalidity/decoy cues. A cued run that fails mod-97 is normally a
// corrupted *real* account (that is why the cued paths bypass the checksum), but
// that assumption inverts when the prose itself frames the number as fake:
// fraud tickets quote decoy IBANs and docs quote sample/placeholder ones, both
// invalid by construction. When such a word sits within a short window of an
// invalid cued run, we must NOT resurrect it. Gating this on `!isValidIban`
// (handled at the call site) means a genuine, mod-97-passing IBAN mentioned in a
// fraud report is still owned by the strict path and never suppressed.
const INVALIDITY_CUE_RE =
  /\b(?:fraudulent|fraud|fake|decoy|bogus|spoofed|phishing|sample|example|dummy|placeholder|fictitious|invalid|specimen)\b/i;
const INVALIDITY_CUE_WINDOW = 48;
// Trailing-cue path: the "IBAN" acronym can also TRAIL the number as a
// parenthetical / bracketed label — "FR14 … (IBAN)", "DE89 … [IBAN]" — the form
// writers reach for when annotating an already-written account number ("refund
// to <number> (IBAN)"). This is the postfix mirror of IBAN_CUED_RE and carries
// the same intent signal, so it likewise licenses a span when the run fails
// mod-97 / country-length (mis-keyed, OCR-corrupted, non-standard groupings): a
// zero-knowledge sanitizer must still redact an account number the writer
// explicitly labels "(IBAN)". Precision is unchanged versus the prefix path — a
// match requires BOTH the full IBAN shape AND the bracketed acronym immediately
// after, an even tighter conjunction than the prefix cue. Captured group is the
// SHAPE only, matching what callers/the bench expect for a bare IBAN.
const IBAN_CUED_TRAILING_RE = /\b([A-Z]{2}[ ]?\d{2}(?:[ ]?[A-Z0-9]){10,30})\s*[([{]\s*IBAN\b/g;

// Official IBAN length per country, from the SWIFT IBAN Registry. Mod-97 alone
// passes ~1% of random strings by chance, so a longer-than-canonical run that
// happens to checksum-validate (e.g. a 32-char "BR15 …" with extra zero groups
// glued on) would otherwise leak as an IBAN. Requiring the compact length to
// match the country's registered length is structural — it generalizes to every
// possible IBAN shape, not the specific value that triggered the gap. Unknown
// country codes fall through (mod-97 alone), preserving recall on jurisdictions
// not yet in the registry.
export const IBAN_LENGTH_BY_COUNTRY: Record<string, number> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
};

/** ISO 7064 mod-97-10 check: a valid IBAN yields a remainder of 1. */
export function isValidIban(raw: string): boolean {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;
  // Country-length gate: if the country is registered, the compact length must
  // match exactly. Random suffixes/prefixes that happen to mod-97 pass (1 in 97)
  // can still match the regex but will fail this check.
  const cc = compact.slice(0, 2);
  const expected = IBAN_LENGTH_BY_COUNTRY[cc];
  if (expected !== undefined && compact.length !== expected) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch >= 'A' && ch <= 'Z' ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const digit of code) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/** Structural-only IBAN check for the account-cued path: ISO shape, a
 * *registered* country code, and the exact registered compact length — but NOT
 * mod-97. A declared account number whose only defect is a wrong check digit
 * (mis-keyed / OCR'd / templated) is still a live account identifier that must
 * be redacted; the country + length gate is what keeps arbitrary structured IDs
 * (unknown country code, or a registered code at the wrong length) from leaking
 * in through the looser "account" cue. */
export function hasRegisteredIbanStructure(raw: string): boolean {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return false;
  const expected = IBAN_LENGTH_BY_COUNTRY[compact.slice(0, 2)];
  return expected !== undefined && compact.length === expected;
}

export function detectIbans(text: string): Span[] {
  const spans: Span[] = [];
  const validated: Array<[number, number]> = [];
  for (const match of text.matchAll(IBAN_RE)) {
    const value = match[0];
    if (!isValidIban(value)) continue;
    const start = match.index;
    const end = start + value.length;
    spans.push({
      start,
      end,
      type: 'IBAN',
      text: value,
      confidence: 0.97,
      source: 'iban',
    });
    validated.push([start, end]);
  }
  // Cue-anchored: emit a span at 0.96 (just under the strict path's 0.97, just
  // over the cascade FPs at 0.95) when the cue word precedes an IBAN-shape that
  // the strict path did not already claim. Skip when contained in a validated
  // span to avoid double-counting.
  const claimed = [...validated];
  for (const match of text.matchAll(IBAN_CUED_RE)) {
    const value = match[1];
    const start = match.index + match[0].length - value.length;
    const end = start + value.length;
    if (claimed.some(([s, e]) => start >= s && end <= e)) continue;
    spans.push({
      start,
      end,
      type: 'IBAN',
      text: value,
      confidence: 0.96,
      source: 'iban-cued',
    });
    claimed.push([start, end]);
  }
  // Trailing parenthetical cue ("<shape> (IBAN)"). The shape is captured group 1
  // and sits at the start of the match, so its offset is match.index. Skip when
  // the strict/prefix-cued path already claimed the run.
  for (const match of text.matchAll(IBAN_CUED_TRAILING_RE)) {
    const value = match[1];
    const start = match.index;
    const end = start + value.length;
    if (claimed.some(([s, e]) => start >= s && end <= e)) continue;
    spans.push({
      start,
      end,
      type: 'IBAN',
      text: value,
      confidence: 0.96,
      source: 'iban-cued',
    });
    claimed.push([start, end]);
  }
  // Account-declaration cue path. Emits at 0.96 (same band as iban-cued) for a
  // structurally-perfect, registered-country/length IBAN that the strict path
  // rejected on mod-97 alone — rescuing mis-keyed/OCR'd declared accounts. The
  // tighter `hasRegisteredIbanStructure` gate (vs. the acronym path's shape-only
  // check) offsets the looser "account" cue. Decoy/sample numbers are suppressed
  // by the invalidity-cue guard, but only when the run is genuinely invalid — a
  // mod-97-valid IBAN is already owned by the strict path above.
  for (const match of text.matchAll(IBAN_ACCOUNT_CUED_RE)) {
    const value = match[1];
    const start = match.index + match[0].length - value.length;
    const end = start + value.length;
    if (validated.some(([s, e]) => start >= s && end <= e)) continue;
    if (spans.some((sp) => start >= sp.start && end <= sp.end)) continue;
    if (!hasRegisteredIbanStructure(value)) continue;
    if (!isValidIban(value)) {
      const windowStart = Math.max(0, match.index - INVALIDITY_CUE_WINDOW);
      const windowEnd = Math.min(text.length, end + INVALIDITY_CUE_WINDOW);
      if (INVALIDITY_CUE_RE.test(text.slice(windowStart, windowEnd))) continue;
    }
    spans.push({
      start,
      end,
      type: 'IBAN',
      text: value,
      confidence: 0.96,
      source: 'iban-account-cued',
    });
  }
  return spans;
}
