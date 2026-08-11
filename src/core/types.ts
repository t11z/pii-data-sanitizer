export type PiiType =
  | 'EMAIL'
  | 'PHONE'
  | 'IBAN'
  | 'CREDIT_CARD'
  | 'IP'
  | 'MAC'
  | 'NATIONAL_ID'
  | 'PASSPORT'
  | 'DATE_OF_BIRTH'
  | 'PERSON';

export const ALL_PII_TYPES: PiiType[] = [
  'EMAIL',
  'PHONE',
  'IBAN',
  'CREDIT_CARD',
  'IP',
  'MAC',
  'NATIONAL_ID',
  'PASSPORT',
  'DATE_OF_BIRTH',
  'PERSON',
];

export type Script =
  | 'Latin'
  | 'Cyrillic'
  | 'Arabic'
  | 'Hebrew'
  | 'Devanagari'
  | 'Han'
  | 'Hangul'
  | 'Bengali'
  | 'Tamil'
  | 'Telugu'
  | 'Gujarati'
  | 'Kannada'
  | 'Malayalam'
  | 'Other';

export interface Token {
  text: string;
  start: number;
  end: number;
  script: Script;
}

export interface Span {
  start: number;
  end: number;
  type: PiiType;
  text: string;
  /** Confidence in the range 0..1. */
  confidence: number;
  /** Identifier of the detector that produced the span. */
  source: string;
}

/**
 * Membership oracle for names. Implemented by the embedded lists (v1) and by the
 * Bloom-filter backed registry (v2+). All lookups expect a lowercased string.
 */
/** Frequency tier of a pack: `core` = common (curated), `ext` = long tail (bulk). */
export type Tier = 'core' | 'ext';

export interface NameSource {
  hasGiven(name: string, script?: Script): boolean;
  hasFamily(name: string, script?: Script): boolean;
  /**
   * Membership test. When `script` is given, only packs for that script are
   * consulted — this avoids cross-script false positives (e.g. a Devanagari
   * word matching the Latin pack by chance).
   */
  has(name: string, script?: Script): boolean;
  /**
   * Best tier a name was found in (`core` beats `ext`), or null if absent.
   * Optional — sources without tier info are treated as `core` by the scorer.
   */
  matchTier?(name: string, script?: Script): Tier | null;
}

export interface DetectOptions {
  /** Which PII types to detect. Defaults to all. */
  types?: PiiType[];
  /** Minimum confidence for a span to be reported. Defaults to 0.5. */
  minConfidence?: number;
  /** Name membership oracle. Defaults to an empty source (no PERSON matches). */
  nameSource?: NameSource;
  /**
   * Externally-produced spans to merge in before overlap resolution. Detector-
   * agnostic: used by the optional LLM second layer (offsets relative to the
   * NFC-normalized text). Subject to the same confidence filter and overlap
   * resolution as heuristic spans. Defaults to none.
   */
  extraSpans?: Span[];
}

export type SanitizeMode = 'redact' | 'pseudonymize';

export interface SanitizeOptions extends DetectOptions {
  /** How matches are replaced. Defaults to 'redact'. */
  mode?: SanitizeMode;
}

export interface MappingEntry {
  placeholder: string;
  original: string;
  type: PiiType;
  /** Id of the identity this attribute belongs to, when it was linked to one. */
  identityId?: number;
}

/** A person whose attributes (name, email, phone, …) were linked together. */
export interface Identity {
  id: number;
  /** Display name for the group (the detected person name, or an email local part). */
  label: string;
  /** Placeholders of the attributes grouped under this identity. */
  placeholders: string[];
}

export interface SanitizeResult {
  text: string;
  spans: Span[];
  mapping: MappingEntry[];
  /** Linked identities (pseudonymize mode only). */
  identities?: Identity[];
}
