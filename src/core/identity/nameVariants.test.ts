import { describe, it, expect } from 'vitest';
import { detect, sanitize } from '../index';
import { nameSourceFromSources } from '../db/fromSources';

const nameSource = nameSourceFromSources();

const persons = (text: string) =>
  detect(text, { nameSource })
    .filter((s) => s.type === 'PERSON')
    .map((s) => s.text);

describe('name variants from a detected full name', () => {
  // "Zzz Qwertz" is held out of the DB; it is detected only via the "Dr." title,
  // which proves the variant scan works without any dictionary entry.
  const heldOut = 'Bitte Dr. Zzz Qwertz kontaktieren.';

  it('matches the firstname.lastname slug of a context-detected name', () => {
    expect(persons(`${heldOut} Link: https://x.example.com/u/zzz.qwertz done.`)).toContain(
      'zzz.qwertz'
    );
  });

  it('matches separator and order variants, plus an initial form', () => {
    expect(persons(`${heldOut} a/zzz_qwertz`)).toContain('zzz_qwertz');
    expect(persons(`${heldOut} a/qwertz.zzz`)).toContain('qwertz.zzz');
    expect(persons(`${heldOut} a/zqwertz`)).toContain('zqwertz');
  });

  it('does NOT fire a variant without an anchoring full name', () => {
    // No full name in the text and the parts are absent from the DB → nothing.
    expect(persons('Link: https://x.example.com/u/zzz.qwertz done.')).toHaveLength(0);
  });

  it('does not match a variant glued inside a longer word', () => {
    expect(persons(`${heldOut} the zzzqwertzsen file`)).not.toContain('zzzqwertz');
  });
});

describe('end-to-end sanitization via name variants', () => {
  const text = 'Host Dr. Joost van den Berg. Link: https://x.example.com/meet/joost.vandenberg';

  it('redacts the slug spelling of the name', () => {
    const { text: out } = sanitize(text, { nameSource, mode: 'redact' });
    expect(out).toContain('meet/[PERSON]');
    expect(out).not.toContain('joost.vandenberg');
  });

  it('folds the slug spelling onto the same pseudonym as the full name', () => {
    const { text: out } = sanitize(text, { nameSource, mode: 'pseudonymize' });
    expect(out).toContain('meet/[PERSON_1]');
    expect(out).not.toContain('[PERSON_2]');
  });
});
