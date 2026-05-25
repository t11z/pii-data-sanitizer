import { describe, it, expect } from 'vitest';
import { detect, sanitize } from '../index';
import { PackNameSource } from '../db/packSource';
import { deriveNamesFromEmail } from './emailNames';

// Small, controlled dictionary: "müller"/"guenther" are curated (core); "mueller"
// (ASCII) and "may" live only in the long tail (ext) — single ext tokens score
// below threshold on their own, which is exactly what email corroboration fixes.
function source(): PackNameSource {
  const s = new PackNameSource();
  s.addWords(['guenther', 'gunther', 'klaus', 'hans', 'maria', 'anna', 'müller'], {
    script: 'Latin',
    tier: 'core',
  });
  s.addWords(['mueller', 'may', 'tehrani'], { script: 'Latin', tier: 'ext' });
  return s;
}

const nameSource = source();
const persons = (text: string) =>
  detect(text, { nameSource })
    .filter((sp) => sp.type === 'PERSON')
    .map((sp) => sp.text);

describe('deriveNamesFromEmail', () => {
  it('extracts a surname from an initial+surname local part', () => {
    expect(deriveNamesFromEmail('gmueller', nameSource)).toEqual([
      { text: 'mueller', kind: 'family', source: 'email' },
    ]);
  });

  it('splits first.last into given and family', () => {
    expect(deriveNamesFromEmail('guenther.mueller', nameSource)).toEqual([
      { text: 'guenther', kind: 'given', source: 'email' },
      { text: 'mueller', kind: 'family', source: 'email' },
    ]);
  });

  it('takes a lone dictionary token as a surname', () => {
    expect(deriveNamesFromEmail('mueller', nameSource)).toEqual([
      { text: 'mueller', kind: 'family', source: 'email' },
    ]);
  });

  it('derives nothing from functional mailboxes', () => {
    expect(deriveNamesFromEmail('info', nameSource)).toEqual([]);
    expect(deriveNamesFromEmail('noreply', nameSource)).toEqual([]);
    expect(deriveNamesFromEmail('support.team', nameSource)).toEqual([]);
  });

  it('derives nothing from non-name local parts', () => {
    expect(deriveNamesFromEmail('xz9', nameSource)).toEqual([]);
    expect(deriveNamesFromEmail('a.b', nameSource)).toEqual([]);
  });
});

describe('email-seeded second pass', () => {
  it('catches a standalone surname once the email vouches for it', () => {
    // Without the email, "Mueller" (ASCII, ext-only single token) is below
    // threshold; the email corroborates it into a detection.
    expect(persons('Tell Mueller it is ready.')).toEqual([]);
    expect(persons('Please email gmueller@example.com and tell Mueller it is ready.')).toEqual([
      'Mueller',
    ]);
  });

  it('keeps ambiguous words suppressed even when an email seeds them', () => {
    // "may" is derivable from the address but the ambiguous-word guard must hold.
    expect(persons('Mail g.may@example.com in May.')).toEqual([]);
  });

  it('never splits an email into separate name spans', () => {
    // The email span (0.99) wins overlap resolution over any in-email name.
    expect(persons('Write to guenther.mueller@example.com soon.')).toEqual([]);
  });
});

describe('identity grouping', () => {
  it('links name, email and a same-line phone into one identity', () => {
    const { mapping, identities } = sanitize(
      'Guenther Mueller wrote in; reach gmueller@example.com or +49 30 1234567 today.',
      { mode: 'pseudonymize', nameSource }
    );
    expect(identities).toHaveLength(1);
    const group = identities![0];
    expect(group.label).toBe('Guenther Mueller');
    expect(new Set(group.placeholders)).toEqual(new Set(['[PERSON_1]', '[EMAIL_1]', '[PHONE_1]']));
    // The grouped attributes keep their distinct placeholders.
    for (const m of mapping) {
      if (group.placeholders.includes(m.placeholder)) expect(m.identityId).toBe(1);
    }
  });

  it('links an umlaut name to its ASCII (ue) email form', () => {
    const { identities } = sanitize(
      'Günther Müller wrote in; reach gmueller@example.com today.',
      { mode: 'pseudonymize', nameSource }
    );
    expect(identities).toHaveLength(1);
    expect(new Set(identities![0].placeholders)).toEqual(new Set(['[PERSON_1]', '[EMAIL_1]']));
  });

  it('does not link an email that carries a different name', () => {
    const { identities } = sanitize('Anna Klaus met gmueller@example.com.', {
      mode: 'pseudonymize',
      nameSource,
    });
    expect(identities).toEqual([]);
  });

  it('omits identities in redact mode', () => {
    const { identities } = sanitize('Guenther Mueller at gmueller@example.com.', {
      mode: 'redact',
      nameSource,
    });
    expect(identities).toBeUndefined();
  });
});
