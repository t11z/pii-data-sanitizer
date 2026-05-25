import type { Span } from '../types';
import { normName } from './resolve';

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
  return links;
}
