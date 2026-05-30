/**
 * Persisted configuration for the optional Ollama second layer.
 *
 * Stored in localStorage only — nothing here is sent anywhere except, when the
 * user enables it, directly to their own Ollama server. The hosted site serves
 * static files only; this keeps the "your data, your sovereignty" story intact.
 */

import { isLoopbackUrl } from './ollama';

export interface LlmSettings {
  enabled: boolean;
  baseUrl: string;
  model: string;
}

const STORAGE_KEY = 'pii-sanitizer.llm';

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  enabled: false,
  baseUrl: 'http://localhost:11434',
  model: '',
};

export function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LLM_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_LLM_SETTINGS.enabled,
      // Loopback-only: a persisted non-local baseUrl (e.g. tampered storage) is
      // discarded in favour of the default, so it never reaches the network layer.
      baseUrl:
        typeof parsed.baseUrl === 'string' && isLoopbackUrl(parsed.baseUrl.trim())
          ? parsed.baseUrl.trim()
          : DEFAULT_LLM_SETTINGS.baseUrl,
      model: typeof parsed.model === 'string' ? parsed.model : DEFAULT_LLM_SETTINGS.model,
    };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
}

export function saveLlmSettings(settings: LlmSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode / disabled) — settings just won't persist.
  }
}
