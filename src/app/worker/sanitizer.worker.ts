import { sanitize, normalize } from '../../core';
import type { SanitizeOptions, SanitizeResult } from '../../core';

interface Request {
  id: number;
  text: string;
  options: SanitizeOptions;
}

export interface WorkerResponse {
  id: number;
  result: SanitizeResult;
  normalized: string;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, text, options } = event.data;
  const normalized = normalize(text);
  const result = sanitize(normalized, options);
  const response: WorkerResponse = { id, result, normalized };
  (self as unknown as Worker).postMessage(response);
};
