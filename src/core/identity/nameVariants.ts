import type { Span } from '../types';
import { tokenize } from '../tokenize';
import { foldLatin } from '../detectors/names';
import { normName } from './resolve';
import { isParticle } from '../context/particles';

// Separators that join a person's name parts in slugs / handles / URLs, plus the
// glued form (empty string): "joost.vandenberg", "joost_vandenberg", "jvandenberg".
const SEPS = ['.', '_', '-', ''];

function isName(s: string): boolean {
  return /^[a-z]{2,}$/.test(s);
}

/** Name parts of `name`, normalized to ASCII (one normalizer), particles kept. */
function partsFrom(name: string, norm: (s: string) => string): string[] {
  return tokenize(name)
    .map((t) => norm(t.text.toLowerCase()).replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
}

function addForm(out: Map<string, string>, value: string, original: string): void {
  // Short forms ("li.na") are too generic to anchor safely.
  if (value.length < 5) return;
  if (!out.has(value)) out.set(value, original);
}

function addVariants(
  out: Map<string, string>,
  given: string,
  family: string,
  original: string
): void {
  const initial = given[0];
  for (const sep of SEPS) {
    addForm(out, given + sep + family, original);
    addForm(out, family + sep + given, original);
    // Initial + surname needs a surname long enough to stay distinctive.
    if (family.length >= 4) {
      addForm(out, initial + sep + family, original);
      addForm(out, family + sep + initial, original);
    }
  }
}

/**
 * From every confirmed multi-part person name, enumerates the slug spellings the
 * same person commonly appears as ("Joost van den Berg" → joost.vandenberg,
 * vandenberg.joost, jvandenberg, joost.berg, …). Both the diacritic fold
 * ("muller") and the German ASCII digraph ("mueller") are produced so either
 * spelling matches. Lone given/family forms are deliberately omitted — too generic.
 */
function buildVariants(personSpans: Span[]): Map<string, string> {
  const out = new Map<string, string>();
  const done = new Set<string>();
  const normalizers: Array<(s: string) => string> = [(t) => normName(t), (t) => foldLatin(t)];

  for (const s of personSpans) {
    if (s.type !== 'PERSON') continue;
    const lc = s.text.toLowerCase();
    if (done.has(lc)) continue;
    done.add(lc);

    for (const norm of normalizers) {
      const parts = partsFrom(s.text, norm);
      if (parts.length < 2) continue;
      const given = parts[0];
      if (!isName(given)) continue;
      const rest = parts.slice(1);
      const families = new Set(
        [rest.join(''), rest.filter((t) => !isParticle(t)).join('')].filter(isName)
      );
      for (const family of families) addVariants(out, given, family, s.text);
    }
  }
  return out;
}

/**
 * Detects slug/handle/URL spellings of people already identified by full name in
 * the same text (e.g. the path "joost.vandenberg" once "Joost van den Berg" is
 * known). High precision: every match is anchored to a confirmed full name and
 * bounded by non-alphanumerics so it never fires inside a longer word.
 */
export function detectNameVariants(text: string, personSpans: Span[]): Span[] {
  const variants = buildVariants(personSpans);
  if (variants.size === 0) return [];

  const alternation = [...variants.keys()]
    .sort((a, b) => b.length - a.length)
    .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  // Trailing "@" is excluded from the boundary: a slug immediately before "@" is
  // an email local part ("olaf.berg@internal"), owned by the email detector — not
  // a standalone person mention. Without this, a confirmed "Olaf Berg" turns the
  // "olaf.berg" of every address into a bogus PERSON span; it stays hidden only
  // while a dotted-TLD email span overlaps it, and leaks for single-label /
  // internal domains ("@internal", "@corp") the email detector doesn't match.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}@])`, 'giu');

  const spans: Span[] = [];
  for (const m of text.matchAll(re)) {
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      type: 'PERSON',
      text: m[0],
      confidence: 0.9,
      source: 'name-variant',
    });
  }
  return spans;
}
