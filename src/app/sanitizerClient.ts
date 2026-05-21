import type { SanitizeOptions } from '../core';
import type { WorkerResponse } from './worker/sanitizer.worker';

export type SanitizeRun = Omit<WorkerResponse, 'id'>;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (run: SanitizeRun) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker/sanitizer.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, ...run } = event.data;
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
