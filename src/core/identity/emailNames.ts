import type { NameSource, Span } from '../types';
import { foldLatin, givenHit, familyHit } from '../detectors/names';
import { isFunctionalMailbox } from '../context/mailboxes';
import { isAmbiguousWord } from '../context/commonWords';
import { isNonNameWord, isRoleWord, isRoleAbbreviation } from '../context/roleWords';
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

// A Title-Case Latin token: leading capital (ASCII, Latin-1 Supplement, or Latin
// Extended-A/B) then a lowercase run, optionally extended by hyphenated Title-Case
// parts. Extended-A/B (Ā-ɏ) covers the stroked / hooked / accented
// letters that Latin-1 Supplement omits — Polish ł/ą/ń, Czech č/š, Croatian đ,
// Hungarian ő, Turkish ı/ğ, Vietnamese ơ/ư — without which the chain misses
// otherwise well-formed names ("Mirosław Szachniewicz", "Łukasz Wójcik").
// Extended-A mixes upper- and lower-case even/odd codepoints in the same block,
// so both position classes accept the whole range; case correctness is enforced
// upstream by isCapitalized on the token surface. ASCII-uppercase tails are
// intentionally excluded from the ASCII lower class so an all-caps acronym
// ("URL", "API") never anchors a chain via this path.
const LATIN_UPPER = 'A-Z\\u00C0-\\u00D6\\u00D8-\\u00DE\\u0100-\\u024F';
const LATIN_LOWER = 'a-z\\u00DF-\\u00F6\\u00F8-\\u00FF\\u0100-\\u024F';
const LATIN_ANY = 'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00DE\\u00DF-\\u00F6\\u00F8-\\u00FF\\u0100-\\u024F';
const TITLECASE_TOKEN =
  `[${LATIN_UPPER}][${LATIN_LOWER}]+(?:-[${LATIN_UPPER}][${LATIN_LOWER}]+)*`;
// Run anchored at end of the substring before the email opener: 2–3 Title-Case
// tokens joined by single spaces, with a non-letter delimiter (or start-of-string)
// in front, so we never bite into the middle of a longer chain like "Eng Petrov".
const RUN_BEFORE_EMAIL = new RegExp(
  `(?:^|[^${LATIN_ANY}])(${TITLECASE_TOKEN}(?:\\s+${TITLECASE_TOKEN}){1,2})\\s*$`
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
 * True when the raw chain-token surface form contains a character that Latin-fold
 * strips. Any such character (ł, ø, ß, ć, ó, ö, ñ, é, ...) is a strong marker of
 * a non-English personal name — brand / business phrases in support prose stay
 * ASCII in practice — and gates the single-segment email-adjacency shape below.
 */
function hasLatinDiacritic(token: string): boolean {
  const lower = token.toLowerCase();
  return foldLatin(lower) !== lower;
}

/**
 * Email-adjacency anchor: when a 2–3 token Latin Title-Case run sits immediately
 * before a bracketed email — `<Run> (<email>)` / `<Run> <<email>>` / `<Run>
 * [<email>]` — the prose token and the email handle are aligned by template, and
 * the run is a person name regardless of whether the tokens are in the database.
 *
 * Two local-part shapes anchor the chain, both structural and language-agnostic:
 *
 * 1. **Name + initial** — `dimitris.p@`, `g.müller@`, `m.kowalska@`: one full-word
 *    segment (≥ 4 chars) that fold-matches one chain token, plus one or two
 *    single-character initial segments that match the leading letter of the
 *    *other* chain token. Overwhelmingly a person convention in business
 *    correspondence; the initial is what rules out `<word>.<word>@` collisions
 *    like `atlanta.marriott@` (both segments full words, no initial → no anchor).
 *
 * 2. **Single-segment given / family + diacritic tell** — `miroslaw@example.pl`
 *    for "Mirosław Szachniewicz", `kacperowicz@…` for "Öystein Kacperowicz": one
 *    segment (≥ 4 chars) that fold-matches exactly one chain token, AND at least
 *    one chain token in the run carries a Latin diacritic (ł, ö, ø, ß, ć, ñ, …).
 *    The diacritic tell is what keeps `ford@ford.com` next to "Ford Motor" or
 *    `apple@apple.com` next to "Apple Music" from anchoring: brand phrases in
 *    English prose stay ASCII, so the single-segment path never fires on them.
 *    Bare-ASCII single-segment matches (`sarah@…` next to "Sarah Johnson") are
 *    already covered by the DB-gated `deriveNamesFromEmail` path, so declining
 *    them here loses no recall — this branch exists to close the OOV
 *    non-English gap those DB-only paths cannot.
 *
 * Shared precision layers for both shapes:
 * - Chain tokens must not be titles, role words, structural nouns, or ambiguous
 *   vocabulary (the same gates used in name detection — they catch
 *   "Customer Service", "Berlin Office", "Mark Smith" entity-like phrases).
 * - The email must not have any functional mailbox segment (info@, support@,
 *   service@, …): role addresses never denote a person.
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
    if (segments.length === 0) continue;
    if (isFunctionalMailbox(localPart) || segments.some(isFunctionalMailbox)) continue;

    const lowered = tokens.map((t) => foldLatin(t.toLowerCase()));
    let anchored = false;

    if (segments.length >= 2) {
      // Shape 1 — CRM "name + initial": exactly one word segment (>= 4 chars) that
      // fold-matches a chain token, plus one or two initial segments (1 char) that
      // match the leading letter of a *different* chain token. Rules out
      // `atlanta.marriott@` (two full words) and `g.X@` next to a non-G chain.
      const wordSegments = segments.filter((s) => s.length >= 4);
      const initialSegments = segments.filter((s) => s.length === 1);
      if (
        wordSegments.length === 1 &&
        initialSegments.length >= 1 &&
        wordSegments.length + initialSegments.length === segments.length
      ) {
        const wordSeg = foldLatin(wordSegments[0]);
        const wordIdx = lowered.findIndex((l) => l === wordSeg);
        if (wordIdx >= 0) {
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
          if (initialsOk) anchored = true;
        }
      }
    } else {
      // Shape 2 — single-segment given/family with diacritic tell: the whole
      // local-part fold-matches exactly one chain token AND some chain token has
      // a Latin diacritic. The diacritic tell narrows to non-English personal
      // names (the OOV population this branch exists to serve) and excludes the
      // English brand-pair shape `ford@` / `apple@` where both chain tokens are
      // plain ASCII. A second gate — the OTHER chain token(s) together have
      // ≥ 6 characters — rejects short common-noun pairs where a diacritic is
      // present but the tokens are dictionary vocabulary ("Café Rouge",
      // "Écran Plat"), because real OOV personal names in the diacritic-heavy
      // languages this branch serves (Polish, Czech, Hungarian, Ukrainian,
      // Turkish, Romanian) carry surnames well past the 5-char boundary
      // ("Szachniewicz", "Kacperowicz", "Grębowicz", "Wróblewska").
      const seg = segments[0];
      if (seg.length >= 4) {
        const foldedSeg = foldLatin(seg);
        const wordIdx = lowered.findIndex((l) => l === foldedSeg);
        const matches = lowered.filter((l) => l === foldedSeg).length;
        if (matches === 1 && tokens.some(hasLatinDiacritic)) {
          const restLen = tokens.reduce(
            (sum, tok, idx) => sum + (idx === wordIdx ? 0 : tok.length),
            0
          );
          if (restLen >= 6) anchored = true;
        }
      }
    }

    if (!anchored) continue;

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
