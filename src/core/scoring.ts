import type { Script } from './types';

export interface NameFeatures {
  /** Number of name tokens in the chain (particles excluded). */
  parts: number;
  /** A recognized title precedes the chain (Dr., Herr, ...). */
  titleBefore: boolean;
  /** An appositive role noun precedes the chain (Account holder, Engineer, ...). */
  roleBefore: boolean;
  /** How many parts were found in the name database. */
  dbHits: number;
  /** Single-token candidate whose word is also ordinary vocabulary. */
  singleAmbiguous: boolean;
  /** Candidate sits at the start of a sentence (capitalization less telling). */
  atSentenceStart: boolean;
  /** At least one part matched a common (core) pack — a stronger name signal. */
  coreHit: boolean;
  /** DB hits came only from the long-tail (ext) bulk, none from core. */
  extOnly: boolean;
  script: Script;
}

/**
 * Transparent additive confidence model. No ML black box in v1 — every term is
 * inspectable, which the self-improvement loop relies on when tuning.
 */
export function scoreName(f: NameFeatures): number {
  let s = 0.3;
  if (f.dbHits > 0) s += 0.3;
  if (f.dbHits >= 2) s += 0.1;
  if (f.parts >= 2) s += 0.25;
  if (f.titleBefore) s += 0.35;
  // A role cue only counts for a multi-token candidate; a single capitalized word
  // after a role noun ("Customer Service") must not clear the threshold on its own.
  if (f.roleBefore && f.parts >= 2) s += 0.3;
  if (f.coreHit) s += 0.05; // common names are a stronger signal
  // The common-word ambiguity discount is for a capitalized word with NO cue to
  // vouch for it — see context/commonWords.ts, whose contract is that such a word
  // "needs extra context (a title, or being part of a multi-token name) before it
  // is treated as PII". A multi-token chain already clears singleAmbiguous (parts
  // >= 2); an explicit title is the other half of that contract and must likewise
  // override the discount. Without this, a titled common-word surname ("Mr. Brown",
  // "Ms. White", "Dr. Green") nets negative — the title boost (+0.35) can't cover
  // the stacked penalties (-0.35, and -0.2 because the title's own abbreviation dot
  // makes atSentenceStart fire, and -0.3 when the surname is ext-only) — so a whole
  // class of plainly-named people is dropped. Gating on !titleBefore mirrors the
  // extOnly penalty just below, which the design already exempts under a title.
  if (f.singleAmbiguous && !f.titleBefore) s -= 0.35;
  if (f.singleAmbiguous && f.atSentenceStart && !f.titleBefore) s -= 0.2;
  if (f.singleAmbiguous && f.extOnly && !f.titleBefore) s -= 0.3; // bulk-only word that's also vocab
  // A lone token matched only in the long-tail (ext) bulk data — with no core
  // match, no second name part, and no title to corroborate — is too weak on its
  // own. The bulk lists contain many ordinary words that are also rare names
  // ("Friday", "Service", "Forward"), so a single such hit needs corroboration
  // before it counts as a person. (A role cue alone never promotes a single
  // token — see roleBefore above — so it does not rescue this case either.)
  if (f.parts === 1 && f.extOnly && !f.titleBefore) s -= 0.2;
  return Math.max(0, Math.min(1, s));
}
