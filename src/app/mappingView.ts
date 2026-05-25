import { applySanitization, linkNameParts, normalize, resolveIdentities, resolveOverlaps } from '../core';
import type { Identity, MappingEntry, PiiType, SanitizeMode, Span } from '../core';

/** Stable per-value key — matches the placeholder/identity keying in the core. */
export const keyOf = (type: PiiType, text: string): string => `${type}:${text.toLowerCase()}`;

/** A value the user added by hand to cover a missed detection (false negative). */
export interface ManualEntry {
  type: PiiType;
  value: string;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Synthesizes spans for hand-added values, matching every occurrence in the
 * normalized text. Matches are boundary-aware (not flanked by a letter or digit)
 * so "Sam" never matches inside "Samuel"; internal punctuation is literal, so
 * IPs/emails still match. Spans carry full confidence so they win overlaps.
 */
export function manualSpans(normalized: string, entries: readonly ManualEntry[]): Span[] {
  const spans: Span[] = [];
  for (const entry of entries) {
    const value = normalize(entry.value).trim();
    if (!value) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, 'giu');
    for (const m of normalized.matchAll(re)) {
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: entry.type,
        text: m[0],
        confidence: 1,
        source: 'manual',
      });
    }
  }
  return spans;
}

export interface RemovedRow {
  key: string;
  type: PiiType;
  original: string;
}

export interface MappingGroup {
  id: number;
  label: string;
  rows: MappingEntry[];
}

export interface MappingView {
  /** Sanitized output text, recomputed without the disabled values. */
  text: string;
  rows: MappingEntry[];
  identities: Identity[];
  groups: MappingGroup[];
  ungrouped: MappingEntry[];
  /** placeholder -> effective identity id (auto-grouping with overrides applied). */
  memberOf: Map<string, number>;
  /** Values flagged as false positives, kept as original in the output. */
  removed: RemovedRow[];
  /** Spans that are still replaced (disabled values filtered out). */
  activeSpans: Span[];
}

/**
 * Re-derives the sanitized output, mapping and identity grouping from the raw
 * detected spans, applying the user's manual overrides:
 *  - `disabled`: values to keep as-is (not replaced) — false-positive correction.
 *  - `assignments`: manual group membership (id, or null for ungrouped).
 *
 * With empty overrides this reproduces the worker's result exactly, since it runs
 * the same pure core functions (`linkNameParts`, `applySanitization`,
 * `resolveIdentities`) on the same spans — including the partial-name folding
 * that gives a bare first name the same placeholder as its full name.
 */
export function buildMappingView(
  normalized: string,
  allSpans: Span[],
  mode: SanitizeMode,
  disabled: ReadonlySet<string>,
  assignments: Readonly<Record<string, number | null>>,
  manual: readonly ManualEntry[] = []
): MappingView {
  // Fold hand-added values into the detected spans before anything else, so they
  // flow through the exact same pipeline (folding, numbering, grouping). Their
  // confidence (1) wins any overlap with a weaker detection.
  const merged =
    manual.length > 0
      ? resolveOverlaps([...allSpans, ...manualSpans(normalized, manual)])
      : allSpans;
  const activeSpans = merged.filter((s) => !disabled.has(keyOf(s.type, s.text)));

  // Fold partial name mentions ("Klaus" → "Klaus Hartmann") onto the full name's
  // placeholder, exactly as the core's sanitize() does. Computed after the
  // `disabled` filter so a kept-as-original full name correctly stops folding.
  const personLinks = mode === 'pseudonymize' ? linkNameParts(activeSpans) : new Map();
  const { text, mapping } = applySanitization(normalized, activeSpans, mode, personLinks);

  let rows: MappingEntry[] = mapping;
  let identities: Identity[] = [];
  if (mode === 'pseudonymize') {
    const grouped = resolveIdentities(activeSpans, mapping, normalized);
    rows = grouped.mapping;
    identities = grouped.identities;
  }

  // Effective group membership: start from auto-grouping, then apply overrides.
  const memberOf = new Map<string, number>();
  for (const idn of identities) for (const ph of idn.placeholders) memberOf.set(ph, idn.id);
  const validId = new Set(identities.map((i) => i.id));
  for (const m of rows) {
    const ov = assignments[keyOf(m.type, m.original)];
    if (ov === undefined) continue;
    if (ov === null) memberOf.delete(m.placeholder);
    else if (validId.has(ov)) memberOf.set(m.placeholder, ov);
  }

  const groups = identities
    .map((idn) => ({
      id: idn.id,
      label: idn.label,
      rows: rows.filter((m) => memberOf.get(m.placeholder) === idn.id),
    }))
    .filter((g) => g.rows.length > 0);
  const ungrouped = rows.filter((m) => memberOf.get(m.placeholder) === undefined);

  // Removed (kept-as-original) values, deduplicated per key.
  const removedMap = new Map<string, RemovedRow>();
  for (const s of merged) {
    const k = keyOf(s.type, s.text);
    if (disabled.has(k) && !removedMap.has(k)) {
      removedMap.set(k, { key: k, type: s.type, original: s.text });
    }
  }

  return {
    text,
    rows,
    identities,
    groups,
    ungrouped,
    memberOf,
    removed: [...removedMap.values()],
    activeSpans,
  };
}
