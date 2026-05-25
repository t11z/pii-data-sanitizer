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
