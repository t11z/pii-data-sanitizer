import { describe, it, expect } from 'vitest';
import { sanitize, detect } from './index';
import { nameSourceFromSources } from './db/fromSources';

const nameSource = nameSourceFromSources();

describe('redaction', () => {
  it('replaces matches with type tags', () => {
    const { text } = sanitize('Mail jane@example.com to John Smith.', {
      mode: 'redact',
      nameSource,
    });
    expect(text).toBe('Mail [EMAIL] to [PERSON].');
  });
});

describe('pseudonymization', () => {
  it('assigns stable per-value placeholders', () => {
    const { text, mapping } = sanitize('John Smith called. Later John Smith left.', {
      mode: 'pseudonymize',
      nameSource,
    });
    expect(text).toBe('[PERSON_1] called. Later [PERSON_1] left.');
    expect(mapping[0]).toMatchObject({ placeholder: '[PERSON_1]', original: 'John Smith' });
  });

  it('numbers distinct values separately per type', () => {
    const { text } = sanitize('John Smith met Michael Anderson.', {
      mode: 'pseudonymize',
      nameSource,
    });
    expect(text).toBe('[PERSON_1] met [PERSON_2].');
  });

  it('lists each placeholder only once despite repeated occurrences', () => {
    const { mapping } = sanitize('John Smith called. Later John Smith left.', {
      mode: 'pseudonymize',
      nameSource,
    });
    expect(mapping).toHaveLength(1);
    expect(mapping.map((m) => m.placeholder)).toEqual(['[PERSON_1]']);
  });

  it('keeps one row per distinct value when placeholders repeat in redact mode', () => {
    const { mapping } = sanitize('Mail jane@example.com and jane@example.com again.', {
      mode: 'redact',
      nameSource,
    });
    expect(mapping).toHaveLength(1);
    expect(mapping[0]).toMatchObject({ placeholder: '[EMAIL]', original: 'jane@example.com' });
  });
});

describe('offset integrity', () => {
  it('spans index correctly into the normalized text', () => {
    const text = 'Reach me at a@b.co now';
    const spans = detect(text);
    const email = spans.find((s) => s.type === 'EMAIL')!;
    expect(text.slice(email.start, email.end)).toBe(email.text);
  });
});

describe('type filtering', () => {
  it('only runs requested detectors', () => {
    const spans = detect('John Smith jane@example.com', { types: ['EMAIL'] });
    expect(spans.every((s) => s.type === 'EMAIL')).toBe(true);
  });
});

describe('extraSpans (LLM second layer injection)', () => {
  const text = 'Ping Acme Corp about it.'; // no PII the heuristics catch here
  const extra = {
    start: text.indexOf('Acme Corp'),
    end: text.indexOf('Acme Corp') + 'Acme Corp'.length,
    type: 'PERSON' as const,
    text: 'Acme Corp',
    confidence: 0.6,
    source: 'llm',
  };

  it('merges externally-provided spans into detection', () => {
    const spans = detect(text, { extraSpans: [extra] });
    expect(spans).toContainEqual(extra);
  });

  it('sanitizes using merged extra spans', () => {
    const { text: out } = sanitize(text, { extraSpans: [extra] });
    expect(out).toBe('Ping [PERSON] about it.');
  });

  it('respects the type filter', () => {
    const spans = detect(text, { types: ['EMAIL'], extraSpans: [extra] });
    expect(spans).toHaveLength(0);
  });

  it('respects the confidence threshold', () => {
    const spans = detect(text, { minConfidence: 0.8, extraSpans: [extra] });
    expect(spans).toHaveLength(0);
  });

  it('prefers an overlapping higher-confidence heuristic span', () => {
    const t = 'Email jane@example.com today';
    const start = t.indexOf('jane@example.com');
    // A lower-confidence LLM PERSON span overlapping the email local part.
    const llmSpan = {
      start,
      end: start + 'jane'.length,
      type: 'PERSON' as const,
      text: 'jane',
      confidence: 0.6,
      source: 'llm',
    };
    const spans = detect(t, { extraSpans: [llmSpan] });
    expect(spans.find((s) => s.type === 'EMAIL')).toBeTruthy();
    expect(spans.find((s) => s.source === 'llm')).toBeUndefined();
  });
});
