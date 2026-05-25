import type { Span } from '../types';
import { normName } from './resolve';
import { foldLatin } from '../detectors/names';
import { isParticle } from '../context/particles';

/** Where a partial mention should be folded: the canonical placeholder key and a display original. */
export interface PersonLink {
  /** Lowercased text of the full name to share a placeholder with. */
  key: string;
  /** Surface form of that full name, used as the mapping's display original. */
  original: string;
}

/** Ordered, normalized name tokens (particles kept — they anchor surname suffixes). */
function nameTokens(name: string): string[] {
  return name
    .split(/\s+/)
    .map((t) => normName(t.replace(/[^\p{L}\p{N}-]/gu, '')))
    .filter(Boolean);
}

function isPrefix(part: string[], full: string[]): boolean {
  return part.length < full.length && part.every((t, k) => t === full[k]);
}

function isSuffix(part: string[], full: string[]): boolean {
  if (part.length >= full.length) return false;
  const off = full.length - part.length;
  return part.every((t, k) => t === full[off + k]);
}

/** A partial sits at the start (given name) or end (surname) of a fuller name. */
function partOf(part: string[], full: string[]): boolean {
  return isPrefix(part, full) || isSuffix(part, full);
}

/**
 * Glued/separated slug spellings a full name maps to ("Joost van den Berg" →
 * joostvandenberg, vandenbergjoost, jvandenberg, joostberg, …). Both the ASCII
 * digraph ("mueller") and the plain fold ("muller") are produced. Used to fold a
 * single-token mention recovered from a URL onto the person it spells out.
 */
function gluedKeys(original: string): Set<string> {
  const keys = new Set<string>();
  const raw = original
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter(Boolean);
  for (const norm of [(t: string) => normName(t), (t: string) => foldLatin(t.toLowerCase())]) {
    const parts = raw.map((t) => norm(t).replace(/-/g, '')).filter(Boolean);
    if (parts.length < 2) continue;
    const given = parts[0];
    if (given.length < 2) continue;
    const rest = parts.slice(1);
    for (const fam of [rest.join(''), rest.filter((t) => !isParticle(t)).join('')]) {
      if (fam.length < 2) continue;
      keys.add(given + fam);
      keys.add(fam + given);
      if (fam.length >= 4) {
        keys.add(given[0] + fam);
        keys.add(fam + given[0]);
      }
    }
  }
  return keys;
}

interface Entry {
  original: string;
  tokens: string[];
}

/**
 * Coreference for person mentions: a bare first name ("Joost") or a title-led
 * surname ("Mr. van der Berg" → "van der Berg") almost always refers to the
 * fuller "Joost van der Berg" mentioned elsewhere in the same text. This maps
 * each such partial mention to the unique full name it sits inside (as a
 * leading given-name run or a trailing surname run), so pseudonymization gives
 * them the same placeholder — one person, one token.
 *
 * The link is dropped when it is ambiguous: a partial that fits two distinct
 * full names ("Joost" with both "Joost van der Berg" and "Joost Müller", or a
 * surname two people share) is left on its own placeholder rather than guessed.
 * Matching is done against the *maximal* names (those not themselves contained
 * in a longer one), so "Berg" still resolves to "Joost van der Berg" even when
 * the shorter "van der Berg" also appears.
 */
export function linkNameParts(spans: Span[]): Map<string, PersonLink> {
  const distinct = new Map<string, Entry>();
  for (const s of spans) {
    if (s.type !== 'PERSON') continue;
    const lc = s.text.toLowerCase();
    if (!distinct.has(lc)) distinct.set(lc, { original: s.text, tokens: nameTokens(s.text) });
  }

  const full = [...distinct].filter(([, e]) => e.tokens.length >= 2);
  // Maximal names: not a prefix/suffix of any *other* full name.
  const maximal = full.filter(
    ([lc, e]) => !full.some(([olc, oe]) => olc !== lc && partOf(e.tokens, oe.tokens))
  );

  const links = new Map<string, PersonLink>();
  for (const [lc, e] of distinct) {
    if (e.tokens.length === 0) continue;
    const hits = maximal.filter(([mlc, me]) => mlc !== lc && partOf(e.tokens, me.tokens));
    if (hits.length === 1) {
      const [mlc, me] = hits[0];
      links.set(lc, { key: mlc, original: me.original });
    }
  }

  // Second pass: a glued single-token mention from a URL/slug ("joost.vandenberg",
  // "jvandenberg") folds onto the unique full name it spells out, so it shares the
  // person's placeholder instead of getting its own.
  const gluedCache = new Map<string, Set<string>>();
  for (const [mlc, me] of maximal) gluedCache.set(mlc, gluedKeys(me.original));
  for (const [lc, e] of distinct) {
    if (links.has(lc) || e.tokens.length !== 1) continue;
    const g = e.tokens[0].replace(/-/g, '');
    if (g.length < 5) continue;
    const hits = maximal.filter(([mlc]) => mlc !== lc && gluedCache.get(mlc)!.has(g));
    if (hits.length === 1) links.set(lc, { key: hits[0][0], original: hits[0][1].original });
  }

  return links;
}
