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
} from '../context/roleWords';
import { isSentenceOpener } from '../context/sentenceOpeners';
import { scoreName } from '../scoring';

function isCapitalized(token: string): boolean {
  const first = token[0];
  return !!first && first !== first.toLowerCase() && first === first.toUpperCase();
}

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Strips Latin diacritics so an accented surface form ("García", "María",
 * "López") matches the ASCII-folded dictionary entry. The Latin name lists are an
 * inconsistent mix — a few entries keep their marks ("jürgen"), most are folded
 * ("garcia", "lopez", "gonzalez") — so without this a perfectly in-pack name is
 * missed purely because it appears with its accents. Querying the folded form too
 * recovers the whole class of accented Latin names.
 *
 * Only used on the Latin path: combining marks in Arabic harakat, Hebrew niqqud
 * and Devanagari matras are lexically meaningful, so folding them would corrupt
 * native-script lookups (see callers, gated on script === 'Latin').
 */
export function foldLatin(word: string): string {
  return word.normalize('NFD').replace(COMBINING_MARKS, '');
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
  // Mirror the diacritic-fold fallback used for membership so a name matched only
  // via folding ("García") still reports its real tier instead of null — null
  // would make scoring treat it as ext-only and re-penalize it below threshold.
  const tierLookup = (p: string): Tier | null => {
    const t = matchTier.call(source, p, token.script);
    if (t || token.script !== 'Latin') return t;
    const folded = foldLatin(p);
    return folded !== p ? matchTier.call(source, folded, token.script) : null;
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
    token.script === 'Tamil'
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
const HORIZONTAL_WS = /[^\S\n\r]/;
const SENTENCE_BOUNDARY = '.!?:;\n\r"“”(';

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
  if (next.script !== 'Latin' || !isCapitalized(next.text)) return false;
  if (adjoinsDigit(next, text)) return false;
  return !isNonNameWord(next.text) && !isRoleWord(next.text) && !isTitle(next.text);
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
      if (roleGap.test(between)) roleBefore = true;
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
    if (!isCapitalized(tok.text)) return null;
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
    return null;
  }
  // Caseless scripts: require database membership (or a preceding title/role).
  if (dbHit || titleBefore || roleBefore) return { titleBefore, roleBefore, dbHit };
  return null;
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
      if (!SINGLE_GAP.test(gap)) break;
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

    if (confidence >= minConfidence) {
      spans.push({
        start: spanStart,
        end: spanEnd,
        type: 'PERSON',
        text: text.slice(spanStart, spanEnd),
        confidence,
        source: 'names',
      });
    }

    i = j + 1;
  }

  return spans;
}
