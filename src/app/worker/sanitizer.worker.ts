import { sanitize, normalize, tokenize, PackNameSource, PackLoader } from '../../core';
import type { SanitizeOptions, SanitizeResult, Script, Span } from '../../core';
import { analyzeWithOllama } from '../llm/ollama';

export interface LlmRequest {
  baseUrl: string;
  model: string;
}

interface Request {
  id: number;
  text: string;
  options: SanitizeOptions;
  /** When present, run the optional Ollama second layer and merge its findings. */
  llm?: LlmRequest;
}

export interface WorkerResult {
  id: number;
  result: SanitizeResult;
  normalized: string;
}

export interface WorkerProgress {
  type: 'progress';
  loaded: number;
  total: number;
  loadedNames: number;
  totalNames: number;
}

export type WorkerResponse = WorkerResult | WorkerProgress;

const source = new PackNameSource();
const loader = new PackLoader(source);

function postProgress(): void {
  const msg: WorkerProgress = {
    type: 'progress',
    loaded: loader.loadedCount,
    total: loader.totalCount,
    loadedNames: loader.loadedNameCount,
    totalNames: loader.totalNameCount,
  };
  (self as unknown as Worker).postMessage(msg);
}

let eager: Promise<void> | null = null;
function ensureEager(): Promise<void> {
  if (!eager) {
    eager = loader
      .loadEager()
      .then(() => postProgress())
      .catch(() => {
        // Packs unavailable (e.g. not built yet) — structured PII still works.
      });
  }
  return eager;
}

let backgroundStarted = false;

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, text, options, llm } = event.data;
  const normalized = normalize(text);

  await ensureEager();

  // Load native-script packs for the scripts present in this input.
  const scripts = new Set<Script>(tokenize(normalized).map((t) => t.script));
  try {
    if (await loader.loadForScripts(scripts)) postProgress();
  } catch {
    // Ignore load failures; fall back to whatever is already loaded.
  }

  // Optional LLM second layer (recall boost). Runs on the normalized text so the
  // verbatim offsets it produces line up with the heuristic spans. analyzeWithOllama
  // never throws — any failure yields no extra spans, so we fall back cleanly to
  // heuristics only.
  let extraSpans: Span[] | undefined;
  if (llm) {
    extraSpans = await analyzeWithOllama(normalized, { baseUrl: llm.baseUrl, model: llm.model });
  }

  const result = sanitize(normalized, { ...options, nameSource: source, extraSpans });
  const msg: WorkerResult = { id, result, normalized };
  (self as unknown as Worker).postMessage(msg);

  // Fill in the Latin long tail once, in the background.
  if (!backgroundStarted) {
    backgroundStarted = true;
    loader
      .loadBackground()
      .then(() => postProgress())
      .catch(() => {
        // Optional packs; ignore.
      });
  }
};
