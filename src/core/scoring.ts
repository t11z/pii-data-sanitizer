import type { Script } from './types';

export interface NameFeatures {
  /** Number of name tokens in the chain (particles excluded). */
  parts: number;
  /** A recognized title precedes the chain (Dr., Herr, ...). */
  titleBefore: boolean;
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
  if (f.coreHit) s += 0.05; // common names are a stronger signal
  if (f.singleAmbiguous) s -= 0.35;
  if (f.singleAmbiguous && f.atSentenceStart) s -= 0.2;
  if (f.singleAmbiguous && f.extOnly) s -= 0.3; // a bulk-only word that's also vocab
  return Math.max(0, Math.min(1, s));
}
