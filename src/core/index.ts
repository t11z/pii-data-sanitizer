import { normalize } from './normalize';
import { resolveOverlaps } from './resolve';
import { applySanitization } from './sanitize';
import { PackNameSource } from './db/packSource';
import { detectEmails } from './detectors/structured/email';
import { detectPhones } from './detectors/structured/phone';
import { detectIbans } from './detectors/structured/iban';
import { detectCreditCards } from './detectors/structured/creditCard';
import { detectIps } from './detectors/structured/ip';
import { detectNames } from './detectors/names';
import { ALL_PII_TYPES } from './types';
import type { DetectOptions, PiiType, SanitizeOptions, SanitizeResult, Span } from './types';

const STRUCTURED: Record<string, (text: string) => Span[]> = {
  EMAIL: detectEmails,
  PHONE: detectPhones,
  IBAN: detectIbans,
  CREDIT_CARD: detectCreditCards,
  IP: detectIps,
};

// No names without packs: callers (worker/tests) inject a populated source.
const EMPTY_NAME_SOURCE = new PackNameSource();

/** Detects PII spans in `text`. Offsets are relative to the NFC-normalized text. */
export function detect(text: string, options: DetectOptions = {}): Span[] {
  const normalized = normalize(text);
  const types = new Set<PiiType>(options.types ?? ALL_PII_TYPES);
  const minConfidence = options.minConfidence ?? 0.5;
  const nameSource = options.nameSource ?? EMPTY_NAME_SOURCE;

  const spans: Span[] = [];
  for (const type of Object.keys(STRUCTURED) as PiiType[]) {
    if (types.has(type)) spans.push(...STRUCTURED[type](normalized));
  }
  if (types.has('PERSON')) {
    spans.push(...detectNames(normalized, nameSource, minConfidence));
  }

  const filtered = spans.filter((s) => s.confidence >= minConfidence);
  return resolveOverlaps(filtered);
}

/** Detects and replaces PII, returning the sanitized text plus a mapping. */
export function sanitize(text: string, options: SanitizeOptions = {}): SanitizeResult {
  const normalized = normalize(text);
  const spans = detect(normalized, options);
  const mode = options.mode ?? 'redact';
  const { text: sanitized, mapping } = applySanitization(normalized, spans, mode);
  return { text: sanitized, spans, mapping };
}

export { normalize } from './normalize';
export { tokenize, detectScript } from './tokenize';
export { BloomFilter } from './db/bloom';
export { PackNameSource } from './db/packSource';
export type { PackMeta, Tier } from './db/packSource';
export { PackLoader } from './db/loader';
export type { PackManifest, PackManifestEntry } from './db/loader';
export { ALL_PII_TYPES } from './types';
export type {
  DetectOptions,
  MappingEntry,
  NameSource,
  PiiType,
  SanitizeMode,
  SanitizeOptions,
  SanitizeResult,
  Span,
  Token,
  Script,
} from './types';
