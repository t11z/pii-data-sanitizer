import type { NameSource, Script, Tier } from '../types';
import { foldLatin } from '../detectors/names';
import type { DerivedName } from './emailNames';

/**
 * Wraps a base NameSource with per-document name tokens derived from emails in
 * the same text, so a second `detectNames` pass can pick up standalone mentions
 * of those people. Derived tokens are reported as Latin `core` membership so
 * they score like a curated dictionary hit — but every existing name guard
 * (ambiguous words, sentence openers, structural nouns, multi-token rules) still
 * applies, so a token like "may" stays suppressed.
 */
export function withDerivedNames(base: NameSource, derived: DerivedName[]): NameSource {
  const given = new Set<string>();
  const family = new Set<string>();
  for (const d of derived) (d.kind === 'family' ? family : given).add(d.text);

  const inSet = (set: Set<string>, name: string, script?: Script): boolean => {
    if (script && script !== 'Latin') return false;
    return set.has(foldLatin(name.toLowerCase()));
  };
  const known = (name: string, script?: Script): boolean =>
    inSet(given, name, script) || inSet(family, name, script);

  return {
    hasGiven: (n, s) => base.hasGiven(n, s) || inSet(given, n, s),
    hasFamily: (n, s) => base.hasFamily(n, s) || inSet(family, n, s),
    has: (n, s) => base.has(n, s) || known(n, s),
    // A derived token counts as `core` even if the base knows it only as `ext`:
    // the email is the corroboration that lifts an otherwise sub-threshold
    // long-tail single name over the line.
    matchTier: (n, s): Tier | null => (known(n, s) ? 'core' : (base.matchTier?.(n, s) ?? null)),
  };
}
