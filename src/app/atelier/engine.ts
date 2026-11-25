import { linkNameParts } from '../../core';
import type { Span } from '../../core';
import {
  ENTITY_META,
  type AtelierEntityType,
  type AtelierRedactionMode,
  type AtelierSpan,
  type AtelierView,
  type AuditReport,
  type CustomRule,
  type ExposureAssessment,
  type OutputSegment,
  type RemovedEntity,
  type VaultEntry,
} from './types';

/** Stable key matching the core's keying convention (`TYPE:lowercased`). */
export const atelierKeyOf = (type: AtelierEntityType, text: string): string =>
  `${type}:${text.toLowerCase()}`;

const SECRET_REGEX =
  /\b(?:sk-(?:live|test|proj)?-?[A-Za-z0-9_-]{14,}|gh[pousr]_[A-Za-z0-9]{18,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9\-._~+/]{16,}=*)\b/g;

/**
 * High-precision structural detector for API keys, personal access tokens,
 * AWS access keys, and Bearer tokens. Lives in the app extension layer so
 * `src/core` remains strictly focused on the benchmarked PII types.
 */
export function detectSecrets(normalized: string): AtelierSpan[] {
  const spans: AtelierSpan[] = [];
  const regex = new RegExp(SECRET_REGEX.source, SECRET_REGEX.flags);
  let m: RegExpExecArray | null;
  while ((m = regex.exec(normalized)) !== null) {
    if (m[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    spans.push({
      start: m.index,
      end: m.index + m[0].length,
      type: 'SECRET',
      text: m[0],
      confidence: 0.98,
      source: 'secret',
    });
  }
  return spans;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parses a literal word/phrase or `/pattern/flags` input into a CustomRule.
 * Returns null if blank or syntactically invalid regex.
 */
export function parseCustomRule(rawInput: string, id: string): CustomRule | null {
  const raw = rawInput.trim();
  if (!raw) return null;

  let source: string;
  let flags: string;

  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
    const lastSlash = raw.lastIndexOf('/');
    const pattern = raw.slice(1, lastSlash);
    if (!pattern) return null;
    const rawFlags = raw.slice(lastSlash + 1) || 'gi';
    // Deduplicate flags and ensure global flag for iterative matching.
    const flagSet = new Set(rawFlags.split(''));
    flagSet.add('g');
    source = pattern;
    flags = [...flagSet].join('');
  } else {
    source = escapeRegExp(raw);
    flags = 'gi';
  }

  try {
    // Validate regex compilation eagerly.
    new RegExp(source, flags);
  } catch {
    return null;
  }

  return { id, raw, source, flags };
}

/** Runs user-defined custom rules safely against normalized text. */
export function matchCustomRules(normalized: string, rules: readonly CustomRule[]): AtelierSpan[] {
  const spans: AtelierSpan[] = [];
  for (const rule of rules) {
    let regex: RegExp;
    try {
      regex = new RegExp(rule.source, rule.flags);
    } catch {
      continue;
    }
    let m: RegExpExecArray | null;
    while ((m = regex.exec(normalized)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex += 1;
        continue;
      }
      spans.push({
        start: m.index,
        end: m.index + m[0].length,
        type: 'CUSTOM',
        text: m[0],
        confidence: 1,
        source: 'custom',
      });
    }
  }
  return spans;
}

/**
 * Resolves overlapping spans with the same priority order as `src/core/resolve.ts`:
 * higher confidence first, then longer span, then earlier start.
 */
export function resolveAtelierOverlaps(spans: readonly AtelierSpan[]): AtelierSpan[] {
  const sorted = [...spans].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return a.start - b.start;
  });

  const kept: AtelierSpan[] = [];
  for (const cand of sorted) {
    const overlaps = kept.some((k) => cand.start < k.end && cand.end > k.start);
    if (!overlaps) kept.push(cand);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** Generates a format-preserving partial mask tailored to each entity type. */
export function generateSmartMask(value: string, type: AtelierEntityType): string {
  const clean = value.trim();
  if (type === 'EMAIL') {
    const at = clean.indexOf('@');
    if (at > 0) {
      const local = clean.slice(0, at);
      const domain = clean.slice(at + 1);
      const mLocal = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : '***';
      const parts = domain.split('.');
      const mDom = parts[0].length > 1 ? `${parts[0][0]}***` : '***';
      const tld = parts.length > 1 ? `.${parts.slice(1).join('.')}` : '';
      return `${mLocal}@${mDom}${tld}`;
    }
  }
  if (type === 'IBAN' || type === 'CREDIT_CARD') {
    if (clean.length <= 8) return '•••• ••••';
    return `${clean.slice(0, 4)} •••• •••• ${clean.slice(-4)}`;
  }
  if (type === 'PHONE') {
    if (clean.length <= 6) return '•••• ••••';
    return `${clean.slice(0, 4)} •••• ${clean.slice(-2)}`;
  }
  if (type === 'IP') {
    if (clean.includes('.')) {
      const octets = clean.split('.');
      if (octets.length === 4) return `${octets[0]}.${octets[1]}.•••.•••`;
    }
    return `${clean.slice(0, 4)}:••••:••••`;
  }
  if (type === 'MAC') {
    const parts = clean.split(/[:-]/);
    if (parts.length === 6) return `${parts[0]}:${parts[1]}:••:••:••:${parts[5]}`;
  }
  if (type === 'PERSON') {
    const words = clean.split(/\s+/);
    return words
      .map((w) => (w.length > 1 ? `${w[0]}${'•'.repeat(Math.min(5, w.length - 1))}` : '•'))
      .join(' ');
  }
  if (type === 'SECRET') {
    if (clean.length <= 8) return '••••••••';
    return `${clean.slice(0, 6)}••••••••${clean.slice(-3)}`;
  }
  if (clean.length <= 4) return '••••';
  return `${clean.slice(0, 2)}${'•'.repeat(Math.min(8, clean.length - 3))}${clean.slice(-1)}`;
}

function generateReplacement(
  value: string,
  type: AtelierEntityType,
  mode: AtelierRedactionMode,
  indexForType: number
): string {
  const meta = ENTITY_META[type];
  switch (mode) {
    case 'token':
      return `[${meta.tokenPrefix}_${indexForType}]`;
    case 'block':
      return '█'.repeat(Math.max(6, Math.min(18, value.length)));
    case 'mask':
      return generateSmartMask(value, type);
    case 'synthetic': {
      const pool = meta.fakePool;
      return pool[(indexForType - 1) % pool.length];
    }
  }
}

export function assessExposure(rawRiskPoints: number, count: number): ExposureAssessment {
  const score = Math.min(100, rawRiskPoints);
  if (count === 0) {
    return {
      score: 0,
      level: 'clean',
      badgeLabel: 'Clean',
      summary: 'No exposed personal data detected.',
      ringColor: '#10b981',
      ambientColor: 'rgba(16, 185, 129, 0.14)',
      badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    };
  }
  if (score < 45) {
    return {
      score,
      level: 'moderate',
      badgeLabel: 'Moderate',
      summary: `${count} personal ${count === 1 ? 'entity' : 'entities'} shielded in output.`,
      ringColor: '#38bdf8',
      ambientColor: 'rgba(56, 189, 248, 0.14)',
      badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    };
  }
  if (score < 80) {
    return {
      score,
      level: 'elevated',
      badgeLabel: 'Elevated',
      summary: `${count} sensitive items detected & neutralized.`,
      ringColor: '#f59e0b',
      ambientColor: 'rgba(245, 158, 11, 0.14)',
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    };
  }
  return {
    score,
    level: 'critical',
    badgeLabel: 'Critical PII',
    summary: `High-risk data (${count} items) safely redacted.`,
    ringColor: '#f43f5e',
    ambientColor: 'rgba(244, 63, 94, 0.14)',
    badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  };
}

function emptyCategoryCounts(): Record<AtelierEntityType, number> {
  return {
    SECRET: 0,
    IBAN: 0,
    CREDIT_CARD: 0,
    NATIONAL_ID: 0,
    PASSPORT: 0,
    EMAIL: 0,
    PHONE: 0,
    IP: 0,
    MAC: 0,
    DATE_OF_BIRTH: 0,
    PERSON: 0,
    CUSTOM: 0,
  };
}

export interface BuildAtelierViewParams {
  normalized: string;
  coreSpans: readonly Span[];
  mode: AtelierRedactionMode;
  secretsEnabled: boolean;
  customRules: readonly CustomRule[];
  disabledKeys: ReadonlySet<string>;
}

/**
 * Combines core engine spans with app-layer secret spans and custom rules,
 * folds partial person mentions via core's `linkNameParts`, applies the chosen
 * redaction mode, and produces rich segments, plaintext, Vault Map, and risk
 * telemetry.
 */
export function buildAtelierView(params: BuildAtelierViewParams): AtelierView {
  const { normalized, coreSpans, mode, secretsEnabled, customRules, disabledKeys } = params;

  const combined: AtelierSpan[] = [
    ...coreSpans,
    ...(secretsEnabled ? detectSecrets(normalized) : []),
    ...matchCustomRules(normalized, customRules),
  ];

  const resolvedAll = resolveAtelierOverlaps(combined);
  const activeSpans = resolvedAll.filter((s) => !disabledKeys.has(atelierKeyOf(s.type, s.text)));

  // Collect deduplicated disabled/kept-as-original values so the user can restore them.
  const removedMap = new Map<string, RemovedEntity>();
  for (const s of resolvedAll) {
    const k = atelierKeyOf(s.type, s.text);
    if (disabledKeys.has(k) && !removedMap.has(k)) {
      removedMap.set(k, {
        key: k,
        type: s.type,
        original: s.text,
        label: ENTITY_META[s.type].label,
      });
    }
  }

  // Fold partial person mentions ("Lena" -> "Lena Lindemann") using core's coreference linker.
  const personSpans = activeSpans.filter((s): s is Span => s.type === 'PERSON');
  const personLinks = linkNameParts(personSpans);

  const categoryCounts = emptyCategoryCounts();
  const typeCounters: Partial<Record<AtelierEntityType, number>> = {};
  const reverseMap = new Map<string, string>();
  const vaultMap = new Map<string, VaultEntry>();
  let riskPoints = 0;

  const spanReplacements: string[] = [];

  for (const span of activeSpans) {
    const meta = ENTITY_META[span.type];
    categoryCounts[span.type] += 1;
    riskPoints += meta.severity;

    const link = span.type === 'PERSON' ? personLinks.get(span.text.toLowerCase()) : undefined;
    const canonicalOriginal = link ? link.original : span.text;
    const entityKey = `${span.type}:${link ? link.key : span.text.toLowerCase()}`;

    let replacement = reverseMap.get(entityKey);
    if (!replacement) {
      const nextIdx = (typeCounters[span.type] ?? 0) + 1;
      typeCounters[span.type] = nextIdx;
      replacement = generateReplacement(canonicalOriginal, span.type, mode, nextIdx);
      reverseMap.set(entityKey, replacement);
    }

    // In block mode two distinct entities of identical length produce the same block string;
    // key Vault Map rows by entityKey so every distinct entity remains visible in the Vault table.
    const existing = vaultMap.get(entityKey);
    if (existing) {
      existing.count += 1;
    } else {
      vaultMap.set(entityKey, {
        replacement,
        original: canonicalOriginal,
        type: span.type,
        label: meta.label,
        tokenPrefix: meta.tokenPrefix,
        pillClass: meta.pillClass,
        count: 1,
        key: atelierKeyOf(span.type, canonicalOriginal),
        isCustom: span.type === 'CUSTOM',
      });
    }

    spanReplacements.push(replacement);
  }

  // Build plaintext and structured output segments (avoids raw innerHTML injection).
  let plainText = '';
  const segments: OutputSegment[] = [];
  let cursor = 0;

  activeSpans.forEach((span, idx) => {
    if (span.start > cursor) {
      const chunk = normalized.slice(cursor, span.start);
      plainText += chunk;
      segments.push({ kind: 'text', text: chunk });
    }
    const replacement = spanReplacements[idx];
    const meta = ENTITY_META[span.type];
    plainText += replacement;
    segments.push({
      kind: 'entity',
      original: span.text,
      replacement,
      type: span.type,
      label: meta.label,
      tokenPrefix: meta.tokenPrefix,
      pillClass: meta.pillClass,
      source: span.source,
    });
    cursor = span.end;
  });

  if (cursor < normalized.length) {
    const tail = normalized.slice(cursor);
    plainText += tail;
    segments.push({ kind: 'text', text: tail });
  }

  return {
    plainText,
    segments,
    vaultEntries: [...vaultMap.values()],
    removedEntries: [...removedMap.values()],
    activeSpans,
    categoryCounts,
    totalDetections: activeSpans.length,
    exposure: assessExposure(riskPoints, activeSpans.length),
  };
}

/**
 * Restores sanitized tokens / replacements in an external AI response back to
 * original local values using the active in-memory Vault Map.
 *
 * Replaces longest tokens first so `[EMAIL_10]` is never partially matched by
 * `[EMAIL_1]`. Purely client-side RAM operation.
 */
export function rehydrateText(
  aiText: string,
  vaultEntries: readonly VaultEntry[]
): { text: string; restoredCount: number } {
  if (!aiText) return { text: '', restoredCount: 0 };

  // Deduplicate by replacement string (first entry wins) and sort longest-first.
  const byReplacement = new Map<string, string>();
  for (const entry of vaultEntries) {
    if (entry.replacement && !byReplacement.has(entry.replacement)) {
      byReplacement.set(entry.replacement, entry.original);
    }
  }

  const ordered = [...byReplacement.entries()].sort((a, b) => b[0].length - a[0].length);
  let restored = aiText;
  let restoredCount = 0;

  for (const [replacement, original] of ordered) {
    if (!restored.includes(replacement)) continue;
    const parts = restored.split(replacement);
    restoredCount += parts.length - 1;
    restored = parts.join(original);
  }

  return { text: restored, restoredCount };
}

/**
 * Builds a strictly zero-PII JSON audit report (metadata and category counts
 * only — never includes original strings, input text, or vault mappings).
 */
export function buildAuditReport(
  view: AtelierView,
  mode: AtelierRedactionMode,
  timestamp: string = new Date().toISOString()
): AuditReport {
  const breakdown: Partial<Record<AtelierEntityType, number>> = {};
  for (const [k, count] of Object.entries(view.categoryCounts)) {
    if (count > 0) {
      breakdown[k as AtelierEntityType] = count;
    }
  }
  return {
    tool: 't11z/pii-data-sanitizer',
    timestamp,
    redactionMode: mode,
    zeroKnowledgeVerified: true,
    totalEntitiesRedacted: view.totalDetections,
    uniqueEntitiesInVault: view.vaultEntries.length,
    exposureScore: view.exposure.score,
    exposureLevel: view.exposure.level,
    breakdownByCategory: breakdown,
  };
}
