import { ALL_PII_TYPES } from '../../core';
import type { PiiType, Span } from '../../core';

/**
 * Optional local LLM second layer, backed by a user-run Ollama server.
 *
 * Design constraints (see plan): the engine in `src/core` stays pure and offline;
 * all network access lives here. We never trust LLM-reported character offsets —
 * the model returns verbatim substrings plus a type, and we locate the actual
 * occurrences in the (already NFC-normalized) text ourselves. This keeps offsets
 * exact and silently drops any hallucinated text that isn't present.
 */

const VALID_TYPES = new Set<PiiType>(ALL_PII_TYPES);

/** Confidence assigned to LLM-found spans when the caller doesn't override it. */
export const DEFAULT_LLM_CONFIDENCE = 0.6;
/**
 * Context window requested from the model. Raised above the common 4k default so
 * more of the input fits; inputs beyond this are truncated by Ollama (the UI warns
 * about that). Token estimate elsewhere uses ~4 chars/token against this value.
 */
export const LLM_NUM_CTX = 8192;
const PROBE_TIMEOUT_MS = 2500;
const ANALYZE_TIMEOUT_MS = 120_000;

export interface OllamaProbe {
  ok: boolean;
  models: string[];
}

export interface AnalyzeOptions {
  baseUrl: string;
  model: string;
  /** Confidence to stamp on LLM-found spans. Defaults to DEFAULT_LLM_CONFIDENCE. */
  confidence?: number;
  /** Context window to request. Defaults to LLM_NUM_CTX. */
  numCtx?: number;
  signal?: AbortSignal;
}

interface Finding {
  type: string;
  text: string;
}

const SYSTEM_PROMPT =
  'You are a PII detector. Find every piece of personally identifiable information ' +
  'in the user text and return it as strict JSON. Allowed types: PERSON, EMAIL, PHONE, ' +
  'IBAN, CREDIT_CARD, IP, MAC. For each finding, "text" MUST be copied verbatim from the ' +
  'input (exact substring, same characters and case). Do not invent, translate, or ' +
  'reformat values. Respond ONLY with JSON of the shape ' +
  '{"findings":[{"type":"PERSON","text":"..."}]}. If there is no PII, return {"findings":[]}.';

function joinUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/\/+$/, '') + path;
}

function withTimeout(
  signal: AbortSignal | undefined,
  ms: number
): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * Checks whether an Ollama server is reachable and returns its installed models.
 * Used to gate the UI: when this returns `ok: false`, the LLM option is hidden.
 * Never throws — failures (offline, CORS, CSP, timeout) collapse to `ok: false`.
 */
export async function probeOllama(baseUrl: string, signal?: AbortSignal): Promise<OllamaProbe> {
  const t = withTimeout(signal, PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(joinUrl(baseUrl, '/api/tags'), { signal: t.signal });
    if (!res.ok) return { ok: false, models: [] };
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = Array.isArray(data.models)
      ? data.models
          .map((m) => m?.name)
          .filter((n): n is string => typeof n === 'string' && n.length > 0)
      : [];
    return { ok: true, models };
  } catch {
    return { ok: false, models: [] };
  } finally {
    t.done();
  }
}

/** Parses the model's `response` field into findings, tolerating minor wrapping. */
export function parseFindings(raw: unknown): Finding[] {
  if (typeof raw !== 'string') return [];
  let text = raw.trim();
  if (!text) return [];
  // Strip common code-fence wrappers some models emit despite format:"json".
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Last resort: grab the first {...} block.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  const findings = (parsed as { findings?: unknown })?.findings;
  if (!Array.isArray(findings)) return [];
  return findings
    .filter(
      (f): f is Finding =>
        !!f && typeof (f as Finding).type === 'string' && typeof (f as Finding).text === 'string'
    )
    .map((f) => ({ type: f.type.trim().toUpperCase(), text: f.text }));
}

/**
 * Turns verbatim findings into spans by locating every non-overlapping occurrence
 * of each finding's text in `text`. Exact match first, then a case-insensitive
 * fallback (using the input's own casing). Unknown types and absent text are
 * dropped, so hallucinated values can't leak into the output.
 */
export function findingsToSpans(text: string, findings: Finding[], confidence: number): Span[] {
  const spans: Span[] = [];
  const seen = new Set<string>();
  for (const f of findings) {
    const type = f.type as PiiType;
    if (!VALID_TYPES.has(type)) continue;
    const needle = f.text.trim();
    if (needle.length < 2) continue;

    let offsets = allOccurrences(text, needle, false);
    if (offsets.length === 0) offsets = allOccurrences(text, needle, true);
    for (const start of offsets) {
      const end = start + needle.length;
      const key = `${start}:${end}:${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spans.push({ start, end, type, text: text.slice(start, end), confidence, source: 'llm' });
    }
  }
  return spans;
}

function allOccurrences(haystack: string, needle: string, caseInsensitive: boolean): number[] {
  const h = caseInsensitive ? haystack.toLowerCase() : haystack;
  const n = caseInsensitive ? needle.toLowerCase() : needle;
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const idx = h.indexOf(n, from);
    if (idx === -1) break;
    out.push(idx);
    from = idx + n.length; // non-overlapping
  }
  return out;
}

/**
 * Runs the LLM second layer over `text` and returns extra PII spans (source:'llm').
 * Never throws — any failure (server down, CORS/CSP, bad JSON, timeout) yields `[]`
 * so the caller falls back cleanly to heuristics only.
 */
export async function analyzeWithOllama(text: string, opts: AnalyzeOptions): Promise<Span[]> {
  if (!text.trim()) return [];
  const confidence = opts.confidence ?? DEFAULT_LLM_CONFIDENCE;
  const t = withTimeout(opts.signal, ANALYZE_TIMEOUT_MS);
  try {
    const res = await fetch(joinUrl(opts.baseUrl, '/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: t.signal,
      body: JSON.stringify({
        model: opts.model,
        system: SYSTEM_PROMPT,
        prompt: text,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_ctx: opts.numCtx ?? LLM_NUM_CTX },
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { response?: unknown };
    const findings = parseFindings(data.response);
    return findingsToSpans(text, findings, confidence);
  } catch {
    return [];
  } finally {
    t.done();
  }
}
