import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadLlmSettings, saveLlmSettings, DEFAULT_LLM_SETTINGS } from './settings';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadLlmSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadLlmSettings()).toEqual(DEFAULT_LLM_SETTINGS);
  });

  it('round-trips a valid loopback configuration', () => {
    const settings = { enabled: true, baseUrl: 'http://127.0.0.1:11434', model: 'llama3.2' };
    saveLlmSettings(settings);
    expect(loadLlmSettings()).toEqual(settings);
  });

  it('discards a persisted non-loopback baseUrl in favour of the default', () => {
    localStorage.setItem(
      'pii-sanitizer.llm',
      JSON.stringify({ enabled: true, baseUrl: 'http://evil.com:11434', model: 'm' })
    );
    const loaded = loadLlmSettings();
    expect(loaded.baseUrl).toBe(DEFAULT_LLM_SETTINGS.baseUrl);
    // Other fields are still honoured.
    expect(loaded.enabled).toBe(true);
    expect(loaded.model).toBe('m');
  });

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem('pii-sanitizer.llm', '{not json');
    expect(loadLlmSettings()).toEqual(DEFAULT_LLM_SETTINGS);
  });
});
