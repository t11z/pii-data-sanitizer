import type { NameSource, Span } from '../types';
import { foldLatin, givenHit, familyHit } from '../detectors/names';
import { isFunctionalMailbox } from '../context/mailboxes';
import { isAmbiguousWord } from '../context/commonWords';
import {
  isNonNameWord,
  isRoleWord,
  isRoleAbbreviation,
} from '../context/roleWords';
import { isTitle } from '../context/titles';

/** A name token inferred from an email address, used for cross-reference and linking. */
export interface DerivedName {
  /** Lowercased, diacritic-folded token (matches the dictionary's canonical form). */
  text: string;
  kind: 'given' | 'family';
  source: 'email';
}

const SEP = /[._-]+/;

/** Drop leading/trailing digit runs so "mueller123" / "07jane" reduce to the word. */
function stripDigits(s: string): string {
  return s.replace(/^\d+/, '').replace(/\d+$/, '');
}

/** True when the base dictionary knows this token as a given or family name. */
function dbHit(source: NameSource, word: string): boolean {
  return givenHit(source, word, 'Latin') || familyHit(source, word, 'Latin');
}

/**
 * Infers candidate name tokens from an email local part, gated on the name
 * database so noise ("xz9", "k8") never becomes a name. Handles three shapes:
 *
 *   - `guenther.mueller` → split on separators; each DB-confirmed part is taken
 *     (first → given, last → family).
 *   - `mueller`          → a lone DB-confirmed token (taken as family).
 *   - `gmueller`         → initial-strip: drop one leading letter; if the
 *     remainder is a DB family name, take it as the surname.
 *
 * Functional mailboxes (info@, support@, noreply@, …) yield nothing.
 * Returns folded tokens so accented mentions ("Müller") match later.
 */
export function deriveNamesFromEmail(localPart: string, source: NameSource): DerivedName[] {
  const lower = localPart.toLowerCase();
  if (!lower) return [];

  const segments = lower.split(SEP).filter(Boolean);
  if (segments.length === 0) return [];
  // Any functional segment (or the whole local part) disqualifies the address.
  if (isFunctionalMailbox(lower) || segments.some(isFunctionalMailbox)) return [];

  const out: DerivedName[] = [];
  const add = (word: string, kind: 'given' | 'family') => {
    const text = foldLatin(word.toLowerCase());
    if (text.length >= 2 && !out.some((d) => d.text === text)) {
      out.push({ text, kind, source: 'email' });
    }
  };

  if (segments.length >= 2) {
    segments.forEach((raw, idx) => {
      const part = stripDigits(raw);
      if (part.length >= 2 && dbHit(source, part)) {
        add(part, idx === segments.length - 1 ? 'family' : 'given');
      }
    });
    return out;
  }

  const part = stripDigits(segments[0]);
  if (part.length >= 2 && dbHit(source, part)) {
    add(part, 'family');
    return out;
  }
  // Initial-strip: "gmueller" → "mueller". One leading letter, DB family match.
  if (part.length >= 4) {
    const rest = part.slice(1);
    if (rest.length >= 3 && familyHit(source, rest, 'Latin')) {
      add(rest, 'family');
    }
  }
  return out;
}

// A Title-Case Latin token: leading capital (ASCII or common-Latin precomposed)
// then a lowercase run, optionally extended by hyphenated Title-Case parts. ASCII-
// uppercase tails are intentionally excluded so an all-caps acronym ("URL", "API")
// never anchors a chain via this path.
const TITLECASE_TOKEN =
  '[A-Z\\u00C0-\\u00D6\\u00D8-\\u00DE][a-z\\u00DF-\\u00F6\\u00F8-\\u00FF]+(?:-[A-Z\\u00C0-\\u00D6\\u00D8-\\u00DE][a-z\\u00DF-\\u00F6\\u00F8-\\u00FF]+)*';
// Run anchored at end of the substring before the email opener: 2–3 Title-Case
// tokens joined by single spaces, with a non-letter delimiter (or start-of-string)
// in front, so we never bite into the middle of a longer chain like "Eng Petrov".
const RUN_BEFORE_EMAIL = new RegExp(
  `(?:^|[^A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00DE\\u00DF-\\u00F6\\u00F8-\\u00FF])` +
    `(${TITLECASE_TOKEN}(?:\\s+${TITLECASE_TOKEN}){1,2})\\s*$`
);

function isPersonShapedToken(token: string): boolean {
  const lower = token.toLowerCase();
  if (
    isTitle(lower) ||
    isRoleWord(lower) ||
    isRoleAbbreviation(lower) ||
    isNonNameWord(lower) ||
    isAmbiguousWord(lower)
  ) {
    return false;
  }
  return true;
}

/**
 * Email-adjacency anchor: when a 2–3 token Latin Title-Case run sits immediately
 * before a bracketed email — `<Run> (<email>)` / `<Run> <<email>>` / `<Run>
 * [<email>]` — AND the email's local-part is in the CRM-canonical "name + initial"
 * form (one full-word segment of ≥ 4 chars that exactly matches one chain token's
 * lowercased form, plus one or two single-character initial segments matching the
 * other chain token's leading letter), the run is a person name regardless of
 * whether the tokens are in the database.
 *
 * The signal is structural: a CRM/support template embedded the person's name in
 * both the prose and the email handle, so two unrelated false positives would
 * have to collude (the wrong Title-Case run AND the wrong email convention) to
 * fire. The "name + initial" shape — `dimitris.p@`, `g.müller@`, `m.kowalska@` —
 * is overwhelmingly a person convention in business correspondence; entity
 * mailboxes use `info@`, `sales@`, `<word>.<word>@` or generic functional names,
 * never `<word>.<initial>@`. That gate is what keeps a city/brand pair like
 * "Atlanta Marriott (atlanta.marriott@…)" from anchoring while still catching any
 * language's first/last name pair that follows the template (Greek, Japanese
 * transliterated, Slavic, African — none of which are guaranteed to live in the
 * curated dictionary).
 *
 * Precision layers:
 * - Chain tokens must not be titles, role words, structural nouns, or ambiguous
 *   vocabulary (the same gates used in name detection — they catch
 *   "Customer Service", "Berlin Office", "Mark Smith" entity-like phrases).
 * - The email must not have any functional mailbox segment (info@, support@,
 *   service@, …): role addresses never denote a person.
 * - Initials must align with their adjacent chain token's first letter, so a
 *   random `g.X@` next to "Atlanta Marriott" does not anchor.
 *
 * Returned derived names feed the second-pass `detectNames` via `withDerivedNames`
 * — the chain is then admitted, scored, and overlap-resolved by the existing
 * detector, with no separate span emitted here.
 */
export function deriveNamesFromAdjacentEmails(
  text: string,
  emailSpans: readonly Span[]
): DerivedName[] {
  const out: DerivedName[] = [];
  const seen = new Set<string>();

  for (const email of emailSpans) {
    // Walk back from the email's start over a single horizontal whitespace run to
    // the opening bracket, then read the Title-Case chain that sits before it.
    let openIdx = email.start - 1;
    while (openIdx >= 0 && (text[openIdx] === ' ' || text[openIdx] === '\t')) openIdx--;
    if (openIdx < 0) continue;
    const open = text[openIdx];
    if (open !== '(' && open !== '<' && open !== '[') continue;

    const before = text.slice(0, openIdx);
    const runMatch = before.match(RUN_BEFORE_EMAIL);
    if (!runMatch) continue;
    const tokens = runMatch[1].split(/\s+/);
    if (tokens.length < 2) continue;
    if (!tokens.every(isPersonShapedToken)) continue;

    const at = email.text.indexOf('@');
    if (at < 1) continue;
    const localPart = email.text.slice(0, at).toLowerCase();
    const segments = localPart.split(SEP).filter(Boolean);
    if (segments.length < 2) continue;
    if (isFunctionalMailbox(localPart) || segments.some(isFunctionalMailbox)) continue;

    // Require the CRM "name + initial" shape: exactly one word segment (>= 4 chars)
    // that matches a chain token, plus one or two initial segments (1 char) that
    // match the leading letter of the *other* chain token. This is the precision
    // lever that distinguishes "Dimitris Papadopoulos (dimitris.p@…)" from
    // "Atlanta Marriott (atlanta.marriott@…)".
    const wordSegments = segments.filter((s) => s.length >= 4);
    const initialSegments = segments.filter((s) => s.length === 1);
    if (wordSegments.length !== 1) continue;
    if (initialSegments.length === 0) continue;
    if (wordSegments.length + initialSegments.length !== segments.length) continue;

    const lowered = tokens.map((t) => foldLatin(t.toLowerCase()));
    const wordSeg = foldLatin(wordSegments[0]);
    const wordIdx = lowered.findIndex((l) => l === wordSeg);
    if (wordIdx < 0) continue;

    // Every initial segment must match the leading letter of *some* other chain
    // token, and each chain token can satisfy at most one initial — so a stray
    // `g.X@` next to a non-G chain never anchors.
    const usedTokens = new Set<number>([wordIdx]);
    let initialsOk = true;
    for (const init of initialSegments) {
      const idx = lowered.findIndex(
        (l, i) => !usedTokens.has(i) && l[0] === foldLatin(init)
      );
      if (idx < 0) {
        initialsOk = false;
        break;
      }
      usedTokens.add(idx);
    }
    if (!initialsOk) continue;

    tokens.forEach((tok, idx) => {
      const folded = foldLatin(tok.toLowerCase());
      if (folded.length < 2) return;
      const kind: 'given' | 'family' = idx === tokens.length - 1 ? 'family' : 'given';
      const key = `${kind}:${folded}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ text: folded, kind, source: 'email' });
    });
  }
  return out;
}
