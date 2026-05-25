import { describe, expect, it } from 'vitest';
import { buildMappingView, keyOf } from './mappingView';
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

  it('produces no identities in redact mode but still reports removed values', () => {
    const disabled = new Set([keyOf('PERSON', 'Bob')]);
    const v = buildMappingView(TEXT, SPANS, 'redact', disabled, {});
    expect(v.identities).toEqual([]);
    expect(v.groups).toEqual([]);
    expect(v.text).toBe('[PERSON] paid Bob. [EMAIL] [PERSON] again.');
    expect(v.removed[0].original).toBe('Bob');
  });
});
