import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseFindings,
  findingsToSpans,
  probeOllama,
  analyzeWithOllama,
  isLoopbackUrl,
  DEFAULT_LLM_CONFIDENCE,
  LLM_NUM_CTX,
} from './ollama';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl as unknown as typeof fetch));
}

describe('parseFindings', () => {
  it('parses a clean JSON response', () => {
    const out = parseFindings('{"findings":[{"type":"PERSON","text":"Jane Doe"}]}');
    expect(out).toEqual([{ type: 'PERSON', text: 'Jane Doe' }]);
  });

  it('uppercases and trims the type', () => {
    expect(parseFindings('{"findings":[{"type":" email ","text":"a@b.com"}]}')[0].type).toBe(
      'EMAIL'
    );
  });

  it('strips code-fence wrappers', () => {
    const out = parseFindings('```json\n{"findings":[{"type":"IP","text":"10.0.0.1"}]}\n```');
    expect(out).toEqual([{ type: 'IP', text: '10.0.0.1' }]);
  });

  it('recovers JSON embedded in prose', () => {
    const out = parseFindings('Sure! {"findings":[{"type":"PERSON","text":"Sam"}]} done');
    expect(out).toEqual([{ type: 'PERSON', text: 'Sam' }]);
  });

  it('returns [] for malformed or empty input', () => {
    expect(parseFindings('not json')).toEqual([]);
    expect(parseFindings('')).toEqual([]);
    expect(parseFindings(undefined)).toEqual([]);
    expect(parseFindings('{"findings":"nope"}')).toEqual([]);
  });

  it('drops entries missing type or text', () => {
    expect(parseFindings('{"findings":[{"type":"PERSON"},{"text":"x"},{}]}')).toEqual([]);
  });
});

describe('findingsToSpans', () => {
  const text = 'Call Jane Doe or email jane@doe.com. Jane Doe again.';

  it('locates every non-overlapping occurrence of a verbatim finding', () => {
    const spans = findingsToSpans(text, [{ type: 'PERSON', text: 'Jane Doe' }], 0.6);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({
      type: 'PERSON',
      text: 'Jane Doe',
      source: 'llm',
      confidence: 0.6,
      start: text.indexOf('Jane Doe'),
    });
    expect(spans[1].start).toBe(text.lastIndexOf('Jane Doe'));
  });

  it('falls back to a case-insensitive match using the input casing', () => {
    const spans = findingsToSpans(text, [{ type: 'EMAIL', text: 'JANE@DOE.COM' }], 0.6);
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('jane@doe.com'); // verbatim from input, not the finding
  });

  it('drops unknown types and absent (hallucinated) text', () => {
    const spans = findingsToSpans(
      text,
      [
        { type: 'SSN', text: 'Jane Doe' }, // unknown type
        { type: 'PERSON', text: 'Nobody Here' }, // not present in text
        { type: 'PERSON', text: 'x' }, // too short
      ],
      0.6
    );
    expect(spans).toEqual([]);
  });

  it('dedupes identical span coordinates', () => {
    const spans = findingsToSpans(
      'Bob',
      [
        { type: 'PERSON', text: 'Bob' },
        { type: 'PERSON', text: 'Bob' },
      ],
      0.6
    );
    expect(spans).toHaveLength(1);
  });
});

describe('isLoopbackUrl', () => {
  it('accepts loopback hosts', () => {
    expect(isLoopbackUrl('http://localhost:11434')).toBe(true);
    expect(isLoopbackUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isLoopbackUrl('http://[::1]:11434')).toBe(true);
    expect(isLoopbackUrl('https://localhost')).toBe(true);
    expect(isLoopbackUrl('http://localhost:11434/')).toBe(true);
  });

  it('rejects non-loopback hosts, non-http schemes, and garbage', () => {
    expect(isLoopbackUrl('http://evil.com:11434')).toBe(false);
    expect(isLoopbackUrl('http://192.168.1.5:11434')).toBe(false); // LAN is not loopback
    expect(isLoopbackUrl('http://localhost.evil.com')).toBe(false);
    expect(isLoopbackUrl('file:///etc/passwd')).toBe(false);
    expect(isLoopbackUrl('ftp://localhost')).toBe(false);
    expect(isLoopbackUrl('not a url')).toBe(false);
    expect(isLoopbackUrl('')).toBe(false);
  });
});

describe('probeOllama', () => {
  it('rejects a non-loopback baseUrl without calling fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    expect(await probeOllama('http://evil.com:11434')).toEqual({ ok: false, models: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns models when the server responds', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ models: [{ name: 'llama3.2' }, { name: 'qwen2.5' }] }), {
          status: 200,
        })
    );
    const res = await probeOllama('http://localhost:11434');
    expect(res).toEqual({ ok: true, models: ['llama3.2', 'qwen2.5'] });
  });

  it('normalizes a trailing slash in the base URL', async () => {
    const fetchSpy = vi.fn(() => new Response(JSON.stringify({ models: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    await probeOllama('http://localhost:11434/');
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.anything());
  });

  it('returns ok:false on a network error', async () => {
    mockFetch(() => Promise.reject(new Error('refused')));
    expect(await probeOllama('http://localhost:11434')).toEqual({ ok: false, models: [] });
  });

  it('returns ok:false on a non-2xx response', async () => {
    mockFetch(() => new Response('', { status: 500 }));
    expect(await probeOllama('http://localhost:11434')).toEqual({ ok: false, models: [] });
  });
});

describe('analyzeWithOllama', () => {
  it('maps a model response into spans', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ response: '{"findings":[{"type":"PERSON","text":"Jane Doe"}]}' }),
          { status: 200 }
        )
    );
    const spans = await analyzeWithOllama('Hello Jane Doe.', {
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      type: 'PERSON',
      source: 'llm',
      confidence: DEFAULT_LLM_CONFIDENCE,
    });
  });

  it('requests a larger context window (num_ctx) and disables streaming', async () => {
    let body: Record<string, unknown> = {};
    mockFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ response: '{"findings":[]}' }), { status: 200 });
    });
    await analyzeWithOllama('Hi Jane Doe', {
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
    });
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
    expect((body.options as { num_ctx?: number }).num_ctx).toBe(LLM_NUM_CTX);
  });

  it('honors a custom confidence', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ response: '{"findings":[{"type":"PERSON","text":"Jane Doe"}]}' }),
          { status: 200 }
        )
    );
    const spans = await analyzeWithOllama('Hi Jane Doe', {
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
      confidence: 0.42,
    });
    expect(spans[0].confidence).toBe(0.42);
  });

  it('returns [] on failure (graceful fallback to heuristics)', async () => {
    mockFetch(() => Promise.reject(new Error('boom')));
    expect(
      await analyzeWithOllama('Hi Jane Doe', {
        baseUrl: 'http://localhost:11434',
        model: 'llama3.2',
      })
    ).toEqual([]);
  });

  it('returns [] for empty input without calling the server', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    expect(
      await analyzeWithOllama('   ', { baseUrl: 'http://localhost:11434', model: 'm' })
    ).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses to send user text to a non-loopback host (no fetch)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    expect(
      await analyzeWithOllama('Hi Jane Doe', { baseUrl: 'http://evil.com:11434', model: 'm' })
    ).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
