export type PiiType = 'EMAIL' | 'PHONE' | 'IBAN' | 'CREDIT_CARD' | 'IP' | 'PERSON';

export const ALL_PII_TYPES: PiiType[] = ['EMAIL', 'PHONE', 'IBAN', 'CREDIT_CARD', 'IP', 'PERSON'];

export type Script = 'Latin' | 'Arabic' | 'Hebrew' | 'Devanagari' | 'Han' | 'Other';

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
export interface NameSource {
  hasGiven(name: string): boolean;
  hasFamily(name: string): boolean;
  has(name: string): boolean;
}

export interface DetectOptions {
  /** Which PII types to detect. Defaults to all. */
  types?: PiiType[];
  /** Minimum confidence for a span to be reported. Defaults to 0.5. */
  minConfidence?: number;
  /** Name membership oracle. Defaults to the embedded multilingual lists. */
  nameSource?: NameSource;
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
}

export interface SanitizeResult {
  text: string;
  spans: Span[];
  mapping: MappingEntry[];
}
