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
import { deriveNamesFromEmail } from './identity/emailNames';
import { withDerivedNames } from './identity/augmentedSource';
import { resolveIdentities } from './identity/resolve';
import { linkNameParts } from './identity/coref';
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

    // Second pass: derive candidate names from emails in THIS text and re-run
    // name detection with them added, so standalone mentions of the same person
    // elsewhere are caught (e.g. "gmueller@..." → "Müller" later in the text).
    // resolveOverlaps keeps the email span over any overlapping in-email name,
    // so an email is never split into name spans.
    const emailSpans = spans.filter((s) => s.type === 'EMAIL');
    const sourceEmails = emailSpans.length > 0 ? emailSpans : detectEmails(normalized);
    const derived = sourceEmails.flatMap((s) =>
      deriveNamesFromEmail(s.text.slice(0, s.text.indexOf('@')), nameSource)
    );
    if (derived.length > 0) {
      spans.push(...detectNames(normalized, withDerivedNames(nameSource, derived), minConfidence));
    }
  }

  const filtered = spans.filter((s) => s.confidence >= minConfidence);
  return resolveOverlaps(filtered);
}

/** Detects and replaces PII, returning the sanitized text plus a mapping. */
export function sanitize(text: string, options: SanitizeOptions = {}): SanitizeResult {
  const normalized = normalize(text);
  const spans = detect(normalized, options);
  const mode = options.mode ?? 'redact';
  // Fold partial name mentions onto the full name they corefer with, so one
  // person gets one placeholder. Only meaningful when placeholders are distinct.
  const personLinks = mode === 'pseudonymize' ? linkNameParts(spans) : new Map();
  const { text: sanitized, mapping } = applySanitization(normalized, spans, mode, personLinks);
  if (mode === 'pseudonymize') {
    const grouped = resolveIdentities(spans, mapping, normalized);
    return { text: sanitized, spans, mapping: grouped.mapping, identities: grouped.identities };
  }
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
