import { sanitize, normalize, tokenize, PackNameSource, PackLoader } from '../../core';
import type { SanitizeOptions, SanitizeResult, Script } from '../../core';

interface Request {
  id: number;
  text: string;
  options: SanitizeOptions;
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
}

export type WorkerResponse = WorkerResult | WorkerProgress;

const source = new PackNameSource();
const loader = new PackLoader(source);

function postProgress(): void {
  const msg: WorkerProgress = {
    type: 'progress',
    loaded: loader.loadedCount,
    total: loader.totalCount,
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
  const { id, text, options } = event.data;
  const normalized = normalize(text);

  await ensureEager();

  // Load native-script packs for the scripts present in this input.
  const scripts = new Set<Script>(tokenize(normalized).map((t) => t.script));
  try {
    if (await loader.loadForScripts(scripts)) postProgress();
  } catch {
    // Ignore load failures; fall back to whatever is already loaded.
  }

  const result = sanitize(normalized, { ...options, nameSource: source });
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
