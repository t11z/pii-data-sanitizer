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

/**
 * A group the user created by hand to organize the mapping. Purely a display
 * concept — like auto-detected identities it groups distinct placeholders and
 * never changes the sanitized output. Custom groups carry NEGATIVE ids so they
 * can never collide with the core's positive auto-identity ids (resolve.ts).
 */
export interface CustomGroup {
  id: number;
  label: string;
}

export interface MappingView {
  /** Sanitized output text, recomputed without the disabled values. */
  text: string;
  rows: MappingEntry[];
  identities: Identity[];
  groups: MappingGroup[];
  ungrouped: MappingEntry[];
  /** Every assignable target for the row dropdown: auto identities + custom groups. */
  assignableGroups: { id: number; label: string }[];
  /** Custom groups with no rows yet — the UI keeps them visible so they can be filled. */
  emptyCustomGroupIds: number[];
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
 *  - `customGroups`: user-created groups (negative ids) that rows can be assigned
 *    to, alongside the auto-detected identities.
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
  manual: readonly ManualEntry[] = [],
  customGroups: readonly CustomGroup[] = []
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

  // Custom groups only make sense in pseudonymize mode (redact collapses every
  // value of a type to one opaque token, so there are no per-value placeholders
  // to organize). They survive in app state but stay inert in redact mode.
  const custom = mode === 'pseudonymize' ? customGroups : [];

  // Effective group membership: start from auto-grouping, then apply overrides.
  // Custom-group ids join `validId` so assignments onto them stick; an assignment
  // to a now-deleted group is simply ignored, reverting the row to ungrouped.
  const memberOf = new Map<string, number>();
  for (const idn of identities) for (const ph of idn.placeholders) memberOf.set(ph, idn.id);
  const validId = new Set<number>([...identities.map((i) => i.id), ...custom.map((g) => g.id)]);
  for (const m of rows) {
    const ov = assignments[keyOf(m.type, m.original)];
    if (ov === undefined) continue;
    if (ov === null) memberOf.delete(m.placeholder);
    else if (validId.has(ov)) memberOf.set(m.placeholder, ov);
  }

  // Auto identities only show when non-empty; custom groups always show (even
  // empty) so a freshly created group stays visible until the user fills or
  // dissolves it.
  const groups = [
    ...identities
      .map((idn) => ({
        id: idn.id,
        label: idn.label,
        rows: rows.filter((m) => memberOf.get(m.placeholder) === idn.id),
      }))
      .filter((g) => g.rows.length > 0),
    ...custom.map((g) => ({
      id: g.id,
      label: g.label,
      rows: rows.filter((m) => memberOf.get(m.placeholder) === g.id),
    })),
  ];
  const ungrouped = rows.filter((m) => memberOf.get(m.placeholder) === undefined);

  const assignableGroups = [
    ...identities.map((i) => ({ id: i.id, label: i.label })),
    ...custom.map((g) => ({ id: g.id, label: g.label })),
  ];
  const emptyCustomGroupIds = custom
    .filter((g) => !rows.some((m) => memberOf.get(m.placeholder) === g.id))
    .map((g) => g.id);

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
    assignableGroups,
    emptyCustomGroupIds,
    memberOf,
    removed: [...removedMap.values()],
    activeSpans,
  };
}
