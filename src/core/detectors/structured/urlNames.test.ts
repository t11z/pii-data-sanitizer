import { describe, it, expect } from 'vitest';
import { detect, sanitize } from '../../index';
import { nameSourceFromSources } from '../../db/fromSources';
import { withDerivedNames } from '../../identity/augmentedSource';
import type { DerivedName } from '../../identity/emailNames';
import type { NameSource } from '../../types';

const nameSource = nameSourceFromSources();

const persons = (text: string, source: NameSource = nameSource) =>
  detect(text, { nameSource: source })
    .filter((s) => s.type === 'PERSON')
    .map((s) => s.text);

// Inject names that are NOT in the committed dictionary, to prove the URL scan
// generalizes via membership rather than hard-coded values.
const withNames = (...names: Array<[string, 'given' | 'family']>) =>
  withDerivedNames(
    nameSource,
    names.map(([text, kind]): DerivedName => ({ text, kind, source: 'email' }))
  );

describe('names in URLs — conservative DB scan', () => {
  it('flags an adjacent given+family pair in a URL path', () => {
    expect(persons('Join here: https://team.example.com/meet/john.smith today.')).toContain(
      'john.smith'
    );
  });

  it('flags an initial + surname, separated or glued', () => {
    expect(persons('See https://x.example.com/u/j.smith now.')).toContain('j.smith');
    expect(persons('See https://x.example.com/u/jsmith now.')).toContain('jsmith');
  });

  it('generalizes to any DB names (held-out values)', () => {
    const src = withNames(['xyzzy', 'given'], ['plughh', 'family']);
    expect(persons('Profile: https://x.example.com/u/xyzzy.plughh here.', src)).toContain(
      'xyzzy.plughh'
    );
  });

  it('does NOT flag a lone surname-shaped label (company domains stay intact)', () => {
    expect(persons('Visit https://morgan.com for details.')).toHaveLength(0);
    expect(persons('Open https://baker.example.com/login now.')).toHaveLength(0);
  });

  it('does NOT scan the host for name pairs, even when the labels are names', () => {
    // Path-only scan: a person-shaped host pair is left alone (geographic /
    // structural multi-label hosts dominate this position).
    const src = withNames(['los', 'given'], ['angeles', 'family']);
    expect(persons('Office at https://los.angeles.example.com today.', src)).toHaveLength(0);
  });

  it('does NOT flag structural URL words', () => {
    expect(persons('Go to https://www.example.com/index/view here.')).toHaveLength(0);
  });
});

describe('end-to-end redaction of a name in a URL', () => {
  it('redacts an in-DB pair inside the URL path', () => {
    const { text: out } = sanitize('Call: https://x.example.com/meet/john.smith', {
      nameSource,
      mode: 'redact',
    });
    expect(out).toContain('meet/[PERSON]');
    expect(out).not.toContain('john.smith');
  });
});
