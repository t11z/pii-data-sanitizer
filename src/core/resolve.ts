import type { Span } from './types';

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Removes overlapping spans, keeping the strongest. Ranking: higher confidence
 * first, then the longer span, then the earlier start. The result is sorted by
 * start offset.
 */
export function resolveOverlaps(spans: Span[]): Span[] {
  const ranked = [...spans].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });

  const kept: Span[] = [];
  for (const span of ranked) {
    if (!kept.some((k) => overlaps(k, span))) kept.push(span);
  }

  return kept.sort((a, b) => a.start - b.start);
}
