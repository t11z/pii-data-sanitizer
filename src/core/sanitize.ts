import type { MappingEntry, SanitizeMode, Span } from './types';
import type { PersonLink } from './identity/coref';

function buildPlaceholders(
  spans: Span[],
  mode: SanitizeMode,
  personLinks: Map<string, PersonLink>
): { replacements: string[]; mapping: MappingEntry[] } {
  const mapping: MappingEntry[] = [];
  const counters = new Map<string, number>();
  const assigned = new Map<string, string>();
  const seen = new Set<string>();
  const replacements: string[] = [];

  for (const span of spans) {
    // A partial person mention ("Joost", "Mr. van der Berg") folds onto the full
    // name it corefers with, so both share one placeholder and one mapping row.
    const link = span.type === 'PERSON' ? personLinks.get(span.text.toLowerCase()) : undefined;
    const key = `${span.type}:${link ? link.key : span.text.toLowerCase()}`;
    const original = link ? link.original : span.text;
    let placeholder: string;
    if (mode === 'redact') {
      placeholder = `[${span.type}]`;
    } else {
      const existing = assigned.get(key);
      if (existing) {
        placeholder = existing;
      } else {
        const n = (counters.get(span.type) ?? 0) + 1;
        counters.set(span.type, n);
        placeholder = `[${span.type}_${n}]`;
        assigned.set(key, placeholder);
      }
    }
    replacements.push(placeholder);
    // One mapping row per distinct value: repeated occurrences must not produce
    // duplicate rows, and in pseudonymize mode each placeholder appears once.
    if (!seen.has(key)) {
      seen.add(key);
      mapping.push({ placeholder, original, type: span.type });
    }
  }

  return { replacements, mapping };
}

/**
 * Replaces the given (non-overlapping) spans in `text`. `redact` collapses each
 * match to its type tag; `pseudonymize` assigns a stable per-value placeholder
 * so identical originals map to the same token (structure-preserving). The
 * returned mapping lives only in memory — nothing is persisted.
 */
export function applySanitization(
  text: string,
  spans: Span[],
  mode: SanitizeMode,
  personLinks: Map<string, PersonLink> = new Map()
): { text: string; mapping: MappingEntry[] } {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const { replacements, mapping } = buildPlaceholders(ordered, mode, personLinks);

  let out = '';
  let cursor = 0;
  ordered.forEach((span, idx) => {
    out += text.slice(cursor, span.start) + replacements[idx];
    cursor = span.end;
  });
  out += text.slice(cursor);

  return { text: out, mapping };
}
