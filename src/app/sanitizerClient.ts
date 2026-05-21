import type { SanitizeOptions } from '../core';
import type { WorkerResult, WorkerResponse } from './worker/sanitizer.worker';

export type SanitizeRun = Omit<WorkerResult, 'id'>;
export interface PackProgress {
  loaded: number;
  total: number;
  loadedNames: number;
  totalNames: number;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (run: SanitizeRun) => void>();
let progressHandler: ((p: PackProgress) => void) | null = null;

/** Subscribe to name-pack loading progress (for a UI indicator). */
export function onPackProgress(handler: (p: PackProgress) => void): void {
  progressHandler = handler;
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker/sanitizer.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (!('id' in data)) {
        progressHandler?.({
          loaded: data.loaded,
          total: data.total,
          loadedNames: data.loadedNames,
          totalNames: data.totalNames,
        });
        return;
      }
      const { id, ...run } = data;
      const resolve = pending.get(id);
      if (resolve) {
        pending.delete(id);
        resolve(run);
      }
    };
  }
  return worker;
}

/** Runs detection + sanitization off the main thread. */
export function runSanitize(text: string, options: SanitizeOptions): Promise<SanitizeRun> {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, text, options });
  });
}
