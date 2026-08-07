import { describe, it, expect } from 'vitest';
import { detect, sanitize } from '../index';
import { nameSourceFromSources, nameSourceFromBuildInputs } from '../db/fromSources';

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

  it('does not flag an email local part as a person (slug immediately before "@")', () => {
    // "Orvist Pemberdint" is detected via the "Dr." title; its "orvist.pemberdint"
    // slug is also the local part of an internal-domain address the email detector
    // does not match. The local part is owned by the email address, not a second
    // person mention, so no PERSON span may cover it. Held-out from the DB, so the
    // guard — not a dictionary hit — is what's under test.
    const text = 'Dr. Orvist Pemberdint (orvist.pemberdint@internal) approved the change.';
    expect(persons(text)).toEqual(['Orvist Pemberdint']);
    expect(persons(text)).not.toContain('orvist.pemberdint');
  });

  it('guards both slug orders before "@" (given.family and family.given)', () => {
    const text = 'Prof. Galwyn Fenworth was cc’d as fenworth.galwyn@corp on the thread.';
    expect(persons(text)).toEqual(['Galwyn Fenworth']);
    expect(persons(text)).not.toContain('fenworth.galwyn');
  });

  it('still detects the same slug when it is a URL path part, not an email local part', () => {
    // Precision guard must not cost recall: the slug in a URL (no trailing "@")
    // is still a name variant.
    const text = 'Dr. Orvist Pemberdint. Link: https://x.example.com/u/orvist.pemberdint done.';
    expect(persons(text)).toContain('orvist.pemberdint');
  });

  it('proves the email-local-part held-out names are absent from the full DB', () => {
    const fullSource = nameSourceFromBuildInputs();
    const heldOutNames: Array<[string, 'Latin']> = [
      ['orvist', 'Latin'],
      ['pemberdint', 'Latin'],
      ['galwyn', 'Latin'],
      ['fenworth', 'Latin'],
    ];
    for (const [word, script] of heldOutNames) {
      expect(fullSource.hasGiven(word, script), `${word} should be out-of-DB`).toBe(false);
      expect(fullSource.hasFamily(word, script), `${word} should be out-of-DB`).toBe(false);
    }
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
