import type { NameSource, Script, Span, Tier, Token } from '../types';
import { tokenize } from '../tokenize';
import { isParticle } from '../context/particles';
import { isTitle } from '../context/titles';
import { isAmbiguousWord } from '../context/commonWords';
import {
  isRoleWord,
  isRoleAbbreviation,
  isNonNameWord,
  isHandoffFrame,
  isSourceFrame,
} from '../context/roleWords';
import { isSentenceOpener } from '../context/sentenceOpeners';
import { isLikelyAcronym } from '../context/acronyms';
import { scoreName } from '../scoring';
import { latinFold } from '../latinFold';

function isCapitalized(token: string): boolean {
  const first = token[0];
  return !!first && first !== first.toLowerCase() && first === first.toUpperCase();
}

/**
 * ASCII-folds the surface form so an accented or precomposed-Latin spelling
 * ("García", "Jørgensen", "Łukasz", "Reuß") matches the folded dictionary entry
 * ("garcia", "jorgensen", "lukasz", "reuss") that the ingest sources already
 * ship. The single rule is shared with the build-time `asciiFold` so what gets
 * stored at build time is exactly what gets looked up at runtime — see
 * `src/core/latinFold.ts` for the per-character rationale.
 *
 * Only used on the Latin path: combining marks in Arabic harakat, Hebrew niqqud
 * and Devanagari matras are lexically meaningful, so folding them would corrupt
 * native-script lookups (see callers, gated on script === 'Latin').
 */
export function foldLatin(word: string): string {
  return latinFold(word);
}

/** Membership for one already-lowercased word, with a Latin diacritic-fold fallback. */
function lookup(
  has: (name: string, script: Script) => boolean,
  word: string,
  script: Script
): boolean {
  if (has(word, script)) return true;
  if (script === 'Latin') {
    const folded = foldLatin(word);
    if (folded !== word && has(folded, script)) return true;
  }
  return false;
}

export function givenHit(source: NameSource, token: string, script: Script): boolean {
  const l = token.toLowerCase();
  const has = source.hasGiven.bind(source);
  if (lookup(has, l, script)) return true;
  if (l.includes('-')) return l.split('-').some((p) => lookup(has, p, script));
  return false;
}

export function familyHit(source: NameSource, token: string, script: Script): boolean {
  const l = token.toLowerCase();
  const has = source.hasFamily.bind(source);
  if (lookup(has, l, script)) return true;
  if (l.includes('-')) return l.split('-').some((p) => lookup(has, p, script));
  return false;
}

function anyHit(source: NameSource, token: Token): boolean {
  return givenHit(source, token.text, token.script) || familyHit(source, token.text, token.script);
}

/** Best tier a token (or any of its hyphen parts) was found in. */
function tierOf(source: NameSource, token: Token): Tier | null {
  const matchTier = source.matchTier;
  if (!matchTier) return 'core'; // sources without tier info count as core
  const l = token.text.toLowerCase();
  const parts = l.includes('-') ? [l, ...l.split('-')] : [l];
  // Mirror the diacritic-fold semantic already used for membership (`lookup()`
  // above): on Latin script the accented and folded spellings are the SAME
  // name, so tier reporting must too. Ingest coverage happens to split common
  // Latin diacritic names across tiers — 'garcía' / 'lópez' / 'josé' / 'maría'
  // land in `ext` while their folded forms 'garcia' / 'lopez' / 'jose' /
  // 'maria' are in the curated `core` pack — so returning the raw lookup on
  // its own mis-tiers the accented form as ext and the single-token ext
  // penalty in scoring drops it below threshold. Query BOTH forms and return
  // the stronger tier (core > ext > null); a diacritic-free token folds to
  // itself so this short-circuits to the raw tier, leaving ASCII paths
  // (including the ext-corroborator backward anchor) unchanged.
  const tierLookup = (p: string): Tier | null => {
    const t = matchTier.call(source, p, token.script);
    if (token.script !== 'Latin') return t;
    const folded = foldLatin(p);
    if (folded === p) return t;
    const tFolded = matchTier.call(source, folded, token.script);
    if (t === 'core' || tFolded === 'core') return 'core';
    if (t === 'ext' || tFolded === 'ext') return 'ext';
    return null;
  };
  let best: Tier | null = null;
  for (const p of parts) {
    const t = tierLookup(p);
    if (t === 'core') return 'core';
    if (t === 'ext') best = 'ext';
  }
  return best;
}

function isCaselessNameScript(token: Token): boolean {
  return (
    token.script === 'Arabic' ||
    token.script === 'Hebrew' ||
    token.script === 'Devanagari' ||
    token.script === 'Hangul' ||
    token.script === 'Bengali' ||
    token.script === 'Tamil' ||
    token.script === 'Telugu' ||
    token.script === 'Gujarati' ||
    token.script === 'Kannada' ||
    token.script === 'Malayalam'
  );
}

/**
 * A hyphen-joined token whose head is a particle and whose tail is capitalized,
 * e.g. "al-Rashid", "al-Najjar", "al-Farouk". The tokenizer glues these into one
 * lowercase-initial token, so without this they would fail the capitalization
 * check and break the name chain.
 */
function particleHyphenName(token: Token): boolean {
  if (token.script !== 'Latin') return false;
  const idx = token.text.indexOf('-');
  if (idx <= 0) return false;
  const head = token.text.slice(0, idx);
  const tail = token.text.slice(idx + 1);
  return isParticle(head) && isCapitalized(tail);
}

function nameLike(token: Token, source: NameSource, allowUnknownCap: boolean): boolean {
  if (token.script === 'Latin') {
    if (!isCapitalized(token.text) && !particleHyphenName(token)) return false;
    // Short ALL-CAPS Latin runs are acronyms / initialisms in prose (ID, PIN,
    // DOB, URL, HQ, ...), never a name part — even when the lowercased form
    // coincidentally appears in the long-tail surname list. Rejecting them here
    // keeps a chain like "Sarah Smith DOB" / "Sarah Smith PIN" from absorbing
    // the label. The check is structural (no closed list), so it generalizes to
    // every acronym, including ones the engine has never seen.
    if (isLikelyAcronym(token.text)) return false;
    return anyHit(source, token) || allowUnknownCap;
  }
  if (isCaselessNameScript(token)) {
    return anyHit(source, token);
  }
  return false;
}

// Horizontal whitespace (space, tab, NBSP, ...) but never a line break: name
// parts may be joined by spaces, not across newlines.
const SINGLE_GAP = /^[^\S\n\r]+$/;
// Middle-initial join: a single dot immediately after a one-letter token, then
// horizontal whitespace ("John D. Smith", "Rajesh R. Iyer"). Permitted only when
// the prior token is an initial (see initialDot below), so a real sentence
// boundary ("…engineer arrived. Bob…") never bridges the gap.
const INITIAL_DOT_GAP = /^\.[^\S\n\r]+$/;
/**
 * A token whose final character is directly followed in the source text by a
 * decimal digit is part of a structured identifier ("CZ6508", "PT50", "XR250",
 * "EU2025-0123"), not a human name. The tokenizer splits the letter prefix off
 * the digit run, throwing away that adjacency cue — this restores it. Human
 * names in real prose are not written fused to digits without whitespace, so
 * the guard generalizes far beyond IBAN/BIC/SWIFT (it also blocks model
 * numbers, ticker symbols, and any letter-then-digit identifier prefix from
 * starting or extending a name chain).
 */
function adjoinsDigit(token: Token, text: string): boolean {
  const next = text.charCodeAt(token.end);
  return next >= 48 && next <= 57;
}
// Whitespace plus an optional abbreviation dot, so "Dr. Smith" (the common form)
// gets the title boost — not just "Dr Smith". Never spans a line break.
const TITLE_GAP = /^[^\S\n\r]*\.?[^\S\n\r]*$/;
// Same shape as TITLE_GAP, applied only to abbreviated role cues ("Eng. Petrov")
// so the abbreviation's trailing dot does not break the role-cue link. Full role
// words keep the strict whitespace-only SINGLE_GAP, so a real sentence boundary
// ("...the engineer. Bob ...") never starts a name.
const ROLE_ABBR_GAP = /^[^\S\n\r]*\.?[^\S\n\r]*$/;
// Label-style colon between a role cue and the name: "Engineer: Per Aarvik",
// "Customer: Mary Jones", "Account holder: Bob Davis" — saturates ticket / log /
// form prose. The colon is required (so a sentence boundary "...engineer. Bob..."
// still cannot match this branch), and at least one whitespace must follow it
// (no run-together "Engineer:Per"). Used additively alongside SINGLE_GAP /
// ROLE_ABBR_GAP, so the existing whitespace-only and abbreviation-dot paths are
// unchanged — this only widens the role-cue lookback to accept the label form.
const ROLE_LABEL_GAP = /^[^\S\n\r]*:[^\S\n\r]+$/;
const HORIZONTAL_WS = /[^\S\n\r]/;
const SENTENCE_BOUNDARY = '.!?:;\n\r"“”(';
// "AKA in parens": gap between the last token of a just-emitted name span and
// the alias candidate must be optional horizontal whitespace, an open paren,
// then optional horizontal whitespace — and the closing paren must follow the
// alias directly with at most horizontal whitespace. Both regexes stay
// horizontal so the cue cannot bridge a line break.
const ALIAS_OPEN_GAP = /^[^\S\n\r]*\([^\S\n\r]*$/;
const ALIAS_CLOSE = /^[^\S\n\r]*\)/;

function isSentenceStart(text: string, pos: number): boolean {
  let i = pos - 1;
  while (i >= 0 && HORIZONTAL_WS.test(text[i])) i--;
  if (i < 0) return true;
  return SENTENCE_BOUNDARY.includes(text[i]);
}

interface StartInfo {
  titleBefore: boolean;
  roleBefore: boolean;
  dbHit: boolean;
}

/**
 * Does the token at index `i` lead directly into a *second* name part — another
 * capitalized, non-structural token, reached either immediately or across a run
 * of connective particles ("de", "van der", ...)? All steps stay whitespace-
 * joined on one line. This is the corroboration that lets an otherwise-weak
 * sentence-initial ext token anchor a name: "Bahar Mehrabad", "Marcus de Wilde"
 * carry a real surname after them, whereas a lone "Ask the ...", "Reach out ..."
 * does not (the next token is lowercase). Mirrors the chain-extension rule, so a
 * structural noun ("Service Desk"), role cue ("Dear Customer") or title is not
 * mistaken for the corroborating part.
 */
function nameContinuation(tokens: Token[], i: number, text: string): boolean {
  let j = i;
  while (
    j + 1 < tokens.length &&
    isParticle(tokens[j + 1].text) &&
    SINGLE_GAP.test(text.slice(tokens[j].end, tokens[j + 1].start))
  ) {
    j++;
  }
  const next = tokens[j + 1];
  if (!next) return false;
  if (!SINGLE_GAP.test(text.slice(tokens[j].end, next.start))) return false;
  if (next.script !== 'Latin') return false;
  // A bare capitalized follower OR a particle-hyphen-Cap surname the tokenizer
  // keeps as one lowercase-initial unit ("al-Rashid", "el-Sayyid", "abu-Yusuf")
  // — both carry a real surname after the anchor. Without the second clause an
  // Arabic-style sentence start "Muhammad al-Rashid called." is dropped, while
  // the morphologically equivalent bare-Cap form "Bahar Qorvanni called." is
  // accepted by the same path: an asymmetry, not a precision lever.
  if (!isCapitalized(next.text) && !particleHyphenName(next)) return false;
  if (adjoinsDigit(next, text)) return false;
  // A short ALL-CAPS continuation is an acronym label (the "Tech ID" / "Sales QA"
  // shape), not a corroborating second name part — never let it rescue an
  // otherwise-weak ext-tier sentence-start anchor.
  if (isLikelyAcronym(next.text)) return false;
  return !isNonNameWord(next.text) && !isRoleWord(next.text) && !isTitle(next.text);
}

/**
 * Stricter sibling of `nameContinuation` used by the backward-unknown-cap
 * anchor rule below: returns true only when the corroborating token is a
 * DB-confirmed name that is itself `ext`-tier and not in `AMBIGUOUS_WORDS`.
 *
 * Why the tier+ambiguous gate. The backward extension rescues the population
 * "<unknown cap> <known surname>" that the scoring currently drops — a single
 * `ext`-tier hit on its own is below threshold (the `parts === 1 && extOnly`
 * penalty subtracts 0.2 from 0.6 = 0.4 < 0.5). Restricting the corroborator
 * to `ext`-tier means we rescue ONLY the cases that would otherwise lose
 * altogether, while leaving every shape that already detects untouched.
 * Equally important, `core` is dominated by common Anglo names (Anna, John,
 * Smith), so allowing a `core` corroborator would let "<imperative verb> +
 * <core given name>" — "Email John Smith", "Visit Anna" — promote into a
 * person span and break the existing corpus precision. The `AMBIGUOUS_WORDS`
 * filter on the corroborator suppresses the same kind of accidental match on
 * dictionary collisions like pinyin "wei" / month-name "may" that the single-
 * token path is already careful with.
 */
function knownNameAfter(tokens: Token[], i: number, source: NameSource, text: string): boolean {
  let j = i;
  while (
    j + 1 < tokens.length &&
    isParticle(tokens[j + 1].text) &&
    SINGLE_GAP.test(text.slice(tokens[j].end, tokens[j + 1].start))
  ) {
    j++;
  }
  const next = tokens[j + 1];
  if (!next) return false;
  if (!SINGLE_GAP.test(text.slice(tokens[j].end, next.start))) return false;
  if (next.script !== 'Latin') return false;
  if (!isCapitalized(next.text) && !particleHyphenName(next)) return false;
  if (adjoinsDigit(next, text)) return false;
  if (isLikelyAcronym(next.text)) return false;
  if (isNonNameWord(next.text) || isRoleWord(next.text) || isTitle(next.text)) return false;
  if (!anyHit(source, next)) return false;
  if (tierOf(source, next) !== 'ext') return false;
  if (isAmbiguousWord(next.text.toLowerCase())) return false;
  return true;
}

function nameStart(tokens: Token[], i: number, source: NameSource, text: string): StartInfo | null {
  const tok = tokens[i];
  if (tok.script === 'Han' || tok.script === 'Other') return null;
  // Structured-identifier prefix fused with a digit run ("XR250", "CZ6508"):
  // never a person name, even if it happens to match the dictionary.
  if (adjoinsDigit(tok, text)) return null;

  let titleBefore = false;
  let roleBefore = false;
  if (i > 0) {
    const prev = tokens[i - 1];
    const between = text.slice(prev.end, tok.start);
    if (isTitle(prev.text) && TITLE_GAP.test(between)) titleBefore = true;
    if (isRoleWord(prev.text)) {
      const roleGap = isRoleAbbreviation(prev.text) ? ROLE_ABBR_GAP : SINGLE_GAP;
      if (roleGap.test(between) || ROLE_LABEL_GAP.test(between)) roleBefore = true;
    }
  }
  // Two-token handoff frame: "<handoff_verb> <connector> <Name>". The cue sits two
  // tokens before the candidate, so the single-step lookback above misses it.
  // Common in support prose across languages ("Escalated to ...", "Assigned to
  // ...", "Eskaliert an ...", "Weitergeleitet an ...") and a strong indicator that
  // what follows is a person. isHandoffFrame requires the verb and connector to
  // belong to the same language (so the English article in "delegated an Urgent
  // Ticket" never matches). Treated as a role cue: scoring still requires parts >=
  // 2, and NON_NAME_WORDS still blocks structural chains, so "Escalated to Customer
  // Service Team" / "Weitergeleitet an Kundenservice Team" remain non-detections.
  if (!roleBefore && i >= 2) {
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    if (
      isHandoffFrame(prev2.text, prev.text) &&
      SINGLE_GAP.test(text.slice(prev2.end, prev.start)) &&
      SINGLE_GAP.test(text.slice(prev.end, tok.start))
    ) {
      roleBefore = true;
    }
  }
  // Two-token source frame: "<source-noun> <connector> <Name>", parallel to
  // the handoff frame but for origin-of-message cues ("Complaint from …",
  // "Email from …", "Bericht von …"). Same gating: the noun and connector must
  // belong to the same language entry in SOURCE_FRAMES so cross-language mixes
  // ("update von …" / "Anfrage from …") never fire, and the two cue tokens stay
  // on one whitespace-joined line. Scoring still requires parts >= 2 to credit
  // the cue, and NON_NAME_WORDS still breaks structural follow-ons, so single
  // capitalized words after the connector ("Letter from London arrived") and
  // structural chains ("Notification from Customer Service Team") never
  // promote on the cue alone.
  if (!roleBefore && i >= 2) {
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    if (
      isSourceFrame(prev2.text, prev.text) &&
      SINGLE_GAP.test(text.slice(prev2.end, prev.start)) &&
      SINGLE_GAP.test(text.slice(prev.end, tok.start))
    ) {
      roleBefore = true;
    }
  }

  const dbHit = anyHit(source, tok);

  if (tok.script === 'Latin') {
    // Title/role-anchored particle start: "Dr. van der Berg", "Ms. de Vries",
    // "Engineer de Wilde". A title or role cue sits immediately before a particle
    // that opens a (possibly multi-) particle run leading into a capitalized
    // surname. The chain cannot otherwise begin on the lowercase particle, so the
    // title/role boost is wasted and the name starts only at the bare surname —
    // too weak to clear the threshold and dropped. nameContinuation requires a
    // real capitalized name part after the run (not a structural/role/title word),
    // so "Dr. de Service" / "owner van Department" do not fire. The particle is
    // not itself credited as a DB hit; the surname it leads to is counted during
    // chain extension.
    if (
      (titleBefore || roleBefore) &&
      !isCapitalized(tok.text) &&
      isParticle(tok.text) &&
      nameContinuation(tokens, i, text)
    ) {
      return { titleBefore, roleBefore, dbHit: false };
    }
    // Particle-hyphen surname as the chain's FIRST token, after a title or role
    // cue: "customer al-Rashid al-Makki", "Dr. el-Sayyid Brakkenzoon", "Engineer
    // abu-Yusuf Vandermeerux". The tokenizer glues these as one lowercase-initial
    // token (head = particle, tail = capitalized), so the next bailout would drop
    // them even though the role/title cue strongly licenses a person. Mirrors the
    // bare-particle branch above with the same triple guard — cue + shape +
    // corroborating second name part — so precision holds: a lone particle-hyphen
    // token after the cue ("Customer al-Rashid confirms …"), a structural
    // follower ("Customer al-Rashid Department escalated …"), and a lowercase
    // tail ("Customer al-forno ordered …" → particleHyphenName false) all fail.
    if (
      (titleBefore || roleBefore) &&
      particleHyphenName(tok) &&
      nameContinuation(tokens, i, text)
    ) {
      return { titleBefore, roleBefore, dbHit };
    }
    if (!isCapitalized(tok.text)) return null;
    // Short ALL-CAPS Latin runs are acronyms / initialisms, not name anchors —
    // a title or role cue ("Dr. ID", "Engineer URL") would otherwise push them
    // through the unknownCap path and the title boost alone (0.3 + 0.35 = 0.65)
    // would clear the threshold. Rejecting them here closes the title/role
    // shortcut symmetrically with the chain-extension guard in nameLike.
    if (isLikelyAcronym(tok.text)) return null;
    // A bulk-only (ext) token at a sentence start, with no title/role to vouch
    // for it, is normally too weak to START a name chain: sentence-initial
    // capitalization is uninformative and the long-tail lists contain many
    // ordinary words ("Ask", "Reach", "Daily"). It may anchor ONLY when a
    // following name part corroborates it ("Case escalation: Bahar Mehrabad",
    // "Support note: Marcus de Wilde" — names that open a clause after a label,
    // ubiquitous in support prose) AND the token is not itself a common
    // clause-opener or structural noun. A lone ext word, or a verb/greeting like
    // "Best Regards" / "Call Maria", still falls through to the next genuinely-
    // cased name token.
    if (
      dbHit &&
      !titleBefore &&
      !roleBefore &&
      tierOf(source, tok) !== 'core' &&
      isSentenceStart(text, tok.start) &&
      (isSentenceOpener(tok.text) || isNonNameWord(tok.text) || !nameContinuation(tokens, i, text))
    ) {
      return null;
    }
    if (titleBefore || dbHit) return { titleBefore, roleBefore, dbHit };
    // Role-only start: generalize beyond the DB, but never start on a structural
    // noun (e.g. "Customer Service") — that path needs a real multi-token name.
    if (roleBefore && !isNonNameWord(tok.text)) return { titleBefore, roleBefore, dbHit };
    // Backward unknown-cap anchor: a capitalized non-DB token anchors the chain
    // when an `ext`-tier DB-confirmed name part immediately follows. Symmetric
    // mirror of the forward unknown-cap extension — today "Anna Kuznetsova"
    // detects because the chain starts at the known given "Anna" and absorbs
    // the unknown surname; without this rule "Vitya Volkov" silently drops
    // (Vitya unknown, Volkov a single `ext` token below threshold). The rule
    // generalizes to every language whose given-name table is sparse but the
    // surname is in the long-tail (Russian, Polish, less-common Indian forms,
    // …) without touching dictionary data. Precision filters on the candidate
    // (sentence opener, ambiguous vocab, non-name / role / title cue) mirror
    // the sentence-initial ext path; the corroborator gate (ext-tier and not
    // ambiguous, see `knownNameAfter`) is what keeps "Email John Smith" /
    // "Visit Anna" / "Pacific Wei" from promoting.
    if (
      !isSentenceOpener(tok.text) &&
      !isAmbiguousWord(tok.text.toLowerCase()) &&
      !isNonNameWord(tok.text) &&
      !isRoleWord(tok.text) &&
      !isRoleAbbreviation(tok.text) &&
      !isTitle(tok.text) &&
      knownNameAfter(tokens, i, source, text)
    ) {
      return { titleBefore: false, roleBefore: false, dbHit: false };
    }
    return null;
  }
  // Caseless scripts: require database membership (or a preceding title/role).
  if (dbHit || titleBefore || roleBefore) return { titleBefore, roleBefore, dbHit };
  return null;
}

/**
 * "AKA in parens" frame: a confirmed name span is directly followed by a single
 * capitalized name-shaped token enclosed in parentheses — "Customer von Neumann
 * (Johann) called", "Dr. Patel (Aisha) reviewed", "Müller (Klaus) confirmed".
 * Support and CRM prose marks aliases / nicknames / given-name disambiguators
 * this way, and the inner token sits at a `(`-sentence-start with no title or
 * role cue to vouch for it, so the chain detector's sentence-start guard
 * silently drops it even when it is in the dictionary.
 *
 * Precision is held by the structural fence, not by dictionary membership: the
 * preceding token MUST be the tail of a span we just emitted as PERSON, the
 * alias MUST be a single token directly enclosed by `()` with at most
 * horizontal whitespace, and the token shape MUST be name-like — a Latin
 * Cap-initial token with at least one lowercase letter (which excludes
 * acronyms like "CEO", "HR", "NYC"), not adjoining a digit, and not a known
 * non-name word, role/title cue, or ambiguous common word. Together these
 * gates keep `<Name> (CEO)`, `<Name> (Berlin)`, `<Name> (Active)` (when the
 * word is in NON_NAME_WORDS / AMBIGUOUS_WORDS / role words) from promoting,
 * while letting a real out-of-DB given-name alias detect on the cue alone.
 */
function aliasInParens(tokens: Token[], prevTailIdx: number, text: string): Span | null {
  const alias = tokens[prevTailIdx + 1];
  if (!alias) return null;
  // The previous token's tail and the alias must be separated by `(` only,
  // with at most horizontal whitespace on either side. No other punctuation,
  // no line break.
  if (!ALIAS_OPEN_GAP.test(text.slice(tokens[prevTailIdx].end, alias.start))) return null;
  if (alias.script !== 'Latin') return null;
  if (!isCapitalized(alias.text)) return null;
  // At least one lowercase letter — filters all-caps acronyms ("CEO", "HR",
  // "NYC", "FBI") which are the dominant non-alias parens content after a
  // name in business / support prose.
  if (!/[a-z]/.test(alias.text)) return null;
  if (adjoinsDigit(alias, text)) return null;
  // Known-non-person guards: title/role cues, structural nouns, and
  // ambiguous common words (cities, months, vocabulary collisions like
  // "Berlin", "April", "Frank") that the dictionary tier system would
  // otherwise let through on a single-token path.
  if (isTitle(alias.text)) return null;
  if (isRoleWord(alias.text) || isRoleAbbreviation(alias.text)) return null;
  if (isNonNameWord(alias.text)) return null;
  if (isAmbiguousWord(alias.text.toLowerCase())) return null;
  // The closing paren must follow the alias directly — a second token inside
  // the parens ("(Smith Watson)", "(Berlin office)") is handled (or rejected)
  // by the normal chain path, not this cue.
  if (!ALIAS_CLOSE.test(text.slice(alias.end))) return null;
  return {
    start: alias.start,
    end: alias.end,
    type: 'PERSON',
    text: text.slice(alias.start, alias.end),
    // Structural cue is independently strong: a confirmed name span precedes,
    // the fence is tight, and the alias shape filters block the common
    // non-alias parens content. Set above the default 0.5 threshold but below
    // the title-backed 1.0 chain so a future precision tweak can re-rank.
    confidence: 0.85,
    source: 'names',
  };
}

export function detectNames(text: string, source: NameSource, minConfidence: number): Span[] {
  const tokens = tokenize(text);
  const spans: Span[] = [];
  let i = 0;

  while (i < tokens.length) {
    const start = nameStart(tokens, i, source, text);
    if (!start) {
      i++;
      continue;
    }

    let dbHits = start.dbHit ? 1 : 0;
    let parts = 1;
    let j = i;
    const allowUnknownCap = start.titleBefore || start.roleBefore || start.dbHit;
    const tiers: Array<Tier | null> = start.dbHit ? [tierOf(source, tokens[i])] : [];

    while (j + 1 < tokens.length) {
      const gap = text.slice(tokens[j].end, tokens[j + 1].start);
      // Bridge a single-letter middle initial's trailing dot ("John D. Smith",
      // "Rajesh R. Iyer", "Dr. Aleksy P. Vonderhaar"): the chain otherwise
      // truncates at the initial because SINGLE_GAP rejects the period, leaving
      // the real surname to start a separate (frequently FP) chain on its own.
      // Restricted to one-letter tokens followed in the source by exactly one
      // '.' so multi-letter sentence-final words ("…arrived. Bob…") never bridge.
      const initialBridge =
        tokens[j].text.length === 1 &&
        isCapitalized(tokens[j].text) &&
        text.charCodeAt(tokens[j].end) === 46 /* '.' */ &&
        INITIAL_DOT_GAP.test(gap);
      if (!SINGLE_GAP.test(gap) && !initialBridge) break;
      const next = tokens[j + 1];

      if (isParticle(next.text)) {
        // Skip a *run* of one or more consecutive particles, then require a real
        // name token after the run. Multi-particle surnames are common — Spanish
        // "de la Cruz", Dutch "van der Berg" / "van den Heuvel", German "von der
        // Leyen" — and chaining only a single particle stopped at the second one
        // and truncated the name. Each step stays whitespace-joined on one line.
        let k = j + 1;
        while (
          k + 1 < tokens.length &&
          isParticle(tokens[k + 1].text) &&
          SINGLE_GAP.test(text.slice(tokens[k].end, tokens[k + 1].start))
        ) {
          k++;
        }
        const after = tokens[k + 1];
        const gap2 = after ? text.slice(tokens[k].end, after.start) : '';
        if (after && SINGLE_GAP.test(gap2) && nameLike(after, source, true)) {
          const hit = anyHit(source, after);
          // Mirror the direct-extension guard: an unknown structural noun after a
          // particle run ("van der Department", "de la Invoice") must not become a
          // name part.
          if (!hit && isNonNameWord(after.text)) break;
          if (adjoinsDigit(after, text)) break;
          if (hit) {
            dbHits++;
            tiers.push(tierOf(source, after));
          }
          parts++;
          j = k + 1;
          continue;
        }
        break;
      }

      if (nameLike(next, source, allowUnknownCap || dbHits > 0)) {
        const hit = anyHit(source, next);
        // Don't extend an unknown (non-DB) capitalized token that is a structural
        // noun — keeps "Customer Service Team" from chaining into a fake name.
        if (!hit && isNonNameWord(next.text)) break;
        if (adjoinsDigit(next, text)) break;
        if (hit) {
          dbHits++;
          tiers.push(tierOf(source, next));
        }
        parts++;
        j++;
        continue;
      }
      break;
    }

    // A single-token candidate whose only token is itself a known title or
    // role abbreviation is the cue in isolation ("Customer Dr.", "Sr. Eng.
    // Maria López-García", "Sehr geehrter Herr"), not a person — the real
    // name sits across the cue's trailing abbreviation dot that breaks the
    // chain's whitespace-only join. Without this guard, a preceding title
    // pushes the cue through the unknown-capitalization path
    // (allowUnknownCap) and the title boost alone (0.3 + 0.35 = 0.65) clears
    // the threshold, leaving "Eng" / "Dr" stranded while the real surname
    // detects separately. Multi-part chains like "Don Draper" or "Eng Petrov"
    // (no dot, no break) are unaffected: the cue contributes only as the
    // first part of a longer chain proven by its real surname.
    if (parts === 1 && (isTitle(tokens[i].text) || isRoleAbbreviation(tokens[i].text))) {
      i = j + 1;
      continue;
    }

    const coreHit = tiers.includes('core');
    const extOnly = dbHits > 0 && !coreHit;

    const spanStart = tokens[i].start;
    const spanEnd = tokens[j].end;
    const confidence = scoreName({
      parts,
      titleBefore: start.titleBefore,
      roleBefore: start.roleBefore,
      dbHits,
      singleAmbiguous: parts === 1 && isAmbiguousWord(tokens[i].text.toLowerCase()),
      atSentenceStart: isSentenceStart(text, spanStart),
      coreHit,
      extOnly,
      script: tokens[i].script,
    });

    let nextStart = j + 1;
    if (confidence >= minConfidence) {
      spans.push({
        start: spanStart,
        end: spanEnd,
        type: 'PERSON',
        text: text.slice(spanStart, spanEnd),
        confidence,
        source: 'names',
      });
      const alias = aliasInParens(tokens, j, text);
      if (alias) {
        spans.push(alias);
        nextStart = j + 2;
      }
    }

    i = nextStart;
  }

  return spans;
}
