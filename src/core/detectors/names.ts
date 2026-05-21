import type { NameSource, Script, Span, Tier, Token } from '../types';
import { tokenize } from '../tokenize';
import { isParticle } from '../context/particles';
import { isTitle } from '../context/titles';
import { isAmbiguousWord } from '../context/commonWords';
import { isRoleWord, isRoleAbbreviation, isNonNameWord } from '../context/roleWords';
import { scoreName } from '../scoring';

function isCapitalized(token: string): boolean {
  const first = token[0];
  return !!first && first !== first.toLowerCase() && first === first.toUpperCase();
}

function givenHit(source: NameSource, token: string, script: Script): boolean {
  const l = token.toLowerCase();
  if (source.hasGiven(l, script)) return true;
  if (l.includes('-')) return l.split('-').some((p) => source.hasGiven(p, script));
  return false;
}

function familyHit(source: NameSource, token: string, script: Script): boolean {
  const l = token.toLowerCase();
  if (source.hasFamily(l, script)) return true;
  if (l.includes('-')) return l.split('-').some((p) => source.hasFamily(p, script));
  return false;
}

function anyHit(source: NameSource, token: Token): boolean {
  return givenHit(source, token.text, token.script) || familyHit(source, token.text, token.script);
}

/** Best tier a token (or any of its hyphen parts) was found in. */
function tierOf(source: NameSource, token: Token): Tier | null {
  if (!source.matchTier) return 'core'; // sources without tier info count as core
  const l = token.text.toLowerCase();
  const parts = l.includes('-') ? [l, ...l.split('-')] : [l];
  let best: Tier | null = null;
  for (const p of parts) {
    const t = source.matchTier(p, token.script);
    if (t === 'core') return 'core';
    if (t === 'ext') best = 'ext';
  }
  return best;
}

function isCaselessNameScript(token: Token): boolean {
  return token.script === 'Arabic' || token.script === 'Hebrew' || token.script === 'Devanagari';
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

function nameStart(tokens: Token[], i: number, source: NameSource, text: string): StartInfo | null {
  const tok = tokens[i];
  if (tok.script === 'Han' || tok.script === 'Other') return null;

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

  const dbHit = anyHit(source, tok);

  if (tok.script === 'Latin') {
    if (!isCapitalized(tok.text)) return null;
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

      if (isParticle(next.text) && j + 2 < tokens.length) {
        const after = tokens[j + 2];
        const gap2 = text.slice(next.end, after.start);
        if (SINGLE_GAP.test(gap2) && nameLike(after, source, true)) {
          if (anyHit(source, after)) {
            dbHits++;
            tiers.push(tierOf(source, after));
          }
          parts++;
          j += 2;
          continue;
        }
        break;
      }

      if (nameLike(next, source, allowUnknownCap || dbHits > 0)) {
        const hit = anyHit(source, next);
        // Don't extend an unknown (non-DB) capitalized token that is a structural
        // noun — keeps "Customer Service Team" from chaining into a fake name.
        if (!hit && isNonNameWord(next.text)) break;
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
