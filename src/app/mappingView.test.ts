import { describe, expect, it } from 'vitest';
import { buildMappingView, keyOf, manualSpans } from './mappingView';
import type { PiiType, Span } from '../core';

function span(type: PiiType, text: string, start: number): Span {
  return { type, text, start, end: start + text.length, confidence: 1, source: 'test' };
}

// "Alice paid Bob. alice@x.com Alice again." — Alice appears twice, sharing one value.
const TEXT = 'Alice paid Bob. alice@x.com Alice again.';
const SPANS: Span[] = [
  span('PERSON', 'Alice', 0),
  span('PERSON', 'Bob', 11),
  span('EMAIL', 'alice@x.com', 16),
  span('PERSON', 'Alice', 28),
];

describe('buildMappingView', () => {
  it('reproduces the plain sanitize result when there are no overrides', () => {
    const v = buildMappingView(TEXT, SPANS, 'pseudonymize', new Set(), {});
    // Repeated value collapses to one placeholder and one row.
    expect(v.text).toBe('[PERSON_1] paid [PERSON_2]. [EMAIL_1] [PERSON_1] again.');
    expect(v.rows.map((r) => r.placeholder)).toEqual(['[PERSON_1]', '[PERSON_2]', '[EMAIL_1]']);
    expect(v.removed).toEqual([]);
  });

  it('keeps a disabled value as original and renumbers the rest', () => {
    const disabled = new Set([keyOf('PERSON', 'Bob')]);
    const v = buildMappingView(TEXT, SPANS, 'pseudonymize', disabled, {});
    expect(v.text).toBe('[PERSON_1] paid Bob. [EMAIL_1] [PERSON_1] again.');
    expect(v.rows.some((r) => r.original === 'Bob')).toBe(false);
    expect(v.removed).toEqual([{ key: keyOf('PERSON', 'Bob'), type: 'PERSON', original: 'Bob' }]);
  });

  it('dedupes a disabled value that occurs multiple times', () => {
    const disabled = new Set([keyOf('PERSON', 'Alice')]);
    const v = buildMappingView(TEXT, SPANS, 'pseudonymize', disabled, {});
    expect(v.text).toBe('Alice paid [PERSON_1]. [EMAIL_1] Alice again.');
    expect(v.removed).toHaveLength(1);
    expect(v.removed[0].original).toBe('Alice');
  });

  it('auto-groups the email with the matching person', () => {
    const v = buildMappingView(TEXT, SPANS, 'pseudonymize', new Set(), {});
    const alice = v.identities.find((i) => i.label === 'Alice');
    expect(alice).toBeDefined();
    const aliceGroup = v.groups.find((g) => g.id === alice!.id);
    expect(aliceGroup?.rows.map((r) => r.type).sort()).toEqual(['EMAIL', 'PERSON']);
  });

  it('moves a row into a chosen identity via assignments', () => {
    const base = buildMappingView(TEXT, SPANS, 'pseudonymize', new Set(), {});
    const alice = base.identities.find((i) => i.label === 'Alice')!;
    // Force the standalone Bob person into Alice's identity.
    const v = buildMappingView(TEXT, SPANS, 'pseudonymize', new Set(), {
      [keyOf('PERSON', 'Bob')]: alice.id,
    });
    const aliceGroup = v.groups.find((g) => g.id === alice.id)!;
    expect(aliceGroup.rows.some((r) => r.original === 'Bob')).toBe(true);
    expect(v.ungrouped.some((r) => r.original === 'Bob')).toBe(false);
  });

  it('ungroups a row when assigned null', () => {
    const base = buildMappingView(TEXT, SPANS, 'pseudonymize', new Set(), {});
    const alice = base.identities.find((i) => i.label === 'Alice')!;
    const v = buildMappingView(TEXT, SPANS, 'pseudonymize', new Set(), {
      [keyOf('EMAIL', 'alice@x.com')]: null,
    });
    const aliceGroup = v.groups.find((g) => g.id === alice.id);
    expect(aliceGroup?.rows.some((r) => r.type === 'EMAIL')).toBeFalsy();
    expect(v.ungrouped.some((r) => r.original === 'alice@x.com')).toBe(true);
  });

  it('ignores an assignment to a non-existent identity id', () => {
    const v = buildMappingView(TEXT, SPANS, 'pseudonymize', new Set(), {
      [keyOf('PERSON', 'Bob')]: 999,
    });
    // Falls back to auto-grouping: Bob stays ungrouped.
    expect(v.ungrouped.some((r) => r.original === 'Bob')).toBe(true);
  });

  it('folds a bare first name onto the full name it corefers with', () => {
    // "Joost van der Berg kam. Joost rief an." — the bare "Joost" must share the
    // full name's placeholder and produce no separate row.
    const text = 'Joost van der Berg kam. Joost rief an.';
    const spans: Span[] = [span('PERSON', 'Joost van der Berg', 0), span('PERSON', 'Joost', 24)];
    const v = buildMappingView(text, spans, 'pseudonymize', new Set(), {});
    expect(v.text).toBe('[PERSON_1] kam. [PERSON_1] rief an.');
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({ placeholder: '[PERSON_1]', original: 'Joost van der Berg' });
    expect(v.rows.some((r) => r.original === 'Joost')).toBe(false);
  });

  it('produces no identities in redact mode but still reports removed values', () => {
    const disabled = new Set([keyOf('PERSON', 'Bob')]);
    const v = buildMappingView(TEXT, SPANS, 'redact', disabled, {});
    expect(v.identities).toEqual([]);
    expect(v.groups).toEqual([]);
    expect(v.text).toBe('[PERSON] paid Bob. [EMAIL] [PERSON] again.');
    expect(v.removed[0].original).toBe('Bob');
  });
});

describe('manualSpans', () => {
  it('matches every occurrence, case-insensitively, preserving the matched text', () => {
    const spans = manualSpans('Sing, then SING, then sing.', [{ type: 'PERSON', value: 'Sing' }]);
    expect(spans).toHaveLength(3);
    expect(spans.map((s) => s.text)).toEqual(['Sing', 'SING', 'sing']);
    expect(spans.every((s) => s.source === 'manual' && s.confidence === 1)).toBe(true);
  });

  it('is boundary-aware — does not match inside a longer word', () => {
    const spans = manualSpans('Sam met Samuel and a sample.', [{ type: 'PERSON', value: 'Sam' }]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ start: 0, end: 3, text: 'Sam' });
  });

  it('treats regex metacharacters in the value literally', () => {
    const spans = manualSpans('host 10.0.0.1 here', [{ type: 'IP', value: '10.0.0.1' }]);
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('10.0.0.1');
  });

  it('ignores blank values', () => {
    expect(manualSpans('anything', [{ type: 'PERSON', value: '   ' }])).toEqual([]);
  });
});

describe('buildMappingView with manual entries', () => {
  // "Mara called Mara." — Mara is a missed name the detector never produced.
  const TXT = 'Mara called Mara about the order.';

  it('redacts every occurrence of a hand-added value', () => {
    const v = buildMappingView(TXT, [], 'redact', new Set(), {}, [{ type: 'PERSON', value: 'Mara' }]);
    expect(v.text).toBe('[PERSON] called [PERSON] about the order.');
    expect(v.rows).toHaveLength(1);
    expect(v.rows[0]).toMatchObject({ original: 'Mara', type: 'PERSON' });
  });

  it('pseudonymizes a hand-added value with one stable placeholder', () => {
    const v = buildMappingView(TXT, [], 'pseudonymize', new Set(), {}, [
      { type: 'PERSON', value: 'Mara' },
    ]);
    expect(v.text).toBe('[PERSON_1] called [PERSON_1] about the order.');
    expect(v.rows).toHaveLength(1);
  });

  it('lets a disabled flag keep a manual value as original', () => {
    const v = buildMappingView(TXT, [], 'redact', new Set([keyOf('PERSON', 'Mara')]), {}, [
      { type: 'PERSON', value: 'Mara' },
    ]);
    expect(v.text).toBe(TXT);
    expect(v.removed.some((r) => r.original === 'Mara')).toBe(true);
  });

  it('stops replacing once the manual entry is gone', () => {
    const v = buildMappingView(TXT, [], 'redact', new Set(), {}, []);
    expect(v.text).toBe(TXT);
    expect(v.rows).toHaveLength(0);
  });

  it('a manual value wins an overlap with a weaker detection', () => {
    const weak: Span[] = [
      { type: 'PERSON', text: 'Mara', start: 0, end: 4, confidence: 0.4, source: 'names' },
    ];
    const v = buildMappingView(TXT, weak, 'redact', new Set(), {}, [{ type: 'PERSON', value: 'Mara' }]);
    expect(v.text).toBe('[PERSON] called [PERSON] about the order.');
  });
});
