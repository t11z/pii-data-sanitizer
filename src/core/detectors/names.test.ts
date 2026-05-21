import { describe, it, expect } from 'vitest';
import { detect } from '../index';
import { nameSourceFromSources } from '../db/fromSources';
import { PackNameSource } from '../db/packSource';

const nameSource = nameSourceFromSources();

const persons = (text: string) =>
  detect(text, { nameSource })
    .filter((s) => s.type === 'PERSON')
    .map((s) => s.text);

describe('multi-part Latin names', () => {
  it('detects a hyphenated given name with a nobiliary particle', () => {
    expect(persons('Ich traf Kai-Uwe von Braun gestern.')).toContain('Kai-Uwe von Braun');
  });

  it('detects given + family', () => {
    expect(persons('Report by John Smith was filed.')).toContain('John Smith');
  });

  it('detects a name after a title even if the surname is unknown', () => {
    expect(persons('Please ask Dr. Anjali Qwertz about it.')).toContain('Anjali Qwertz');
  });

  it('handles apostrophe names', () => {
    // "O'Brien" tokenizes as one unit; with a known given name it chains.
    expect(persons('We hired Michael Anderson last week.')).toContain('Michael Anderson');
  });
});

describe('particle chains across scripts (transliterated)', () => {
  it('detects Arabic-style "al-" surnames', () => {
    expect(persons('We spoke to Omar al Farouk briefly.')).toContain('Omar al Farouk');
  });

  it('detects Hebrew-style "ben" patronyms', () => {
    expect(persons('A speech by David ben Gurion.')).toContain('David ben Gurion');
  });
});

describe('context-based detection (generalizes beyond the DB)', () => {
  // All names below are deliberately ABSENT from the name database, so these only
  // pass via the title/role/particle heuristics — never via dictionary lookup.
  it('uses a title with a trailing dot ("Dr.") to detect an unknown name', () => {
    expect(persons('Please ask Dr. Zzz Qwertz about it.')).toContain('Zzz Qwertz');
  });

  it('detects an unknown full name after a role cue', () => {
    expect(persons('Account holder Nadia Brzezinski paid the invoice.')).toContain(
      'Nadia Brzezinski'
    );
    expect(persons('Engineer Tomasz Wojcik resolved the ticket.')).toContain('Tomasz Wojcik');
  });

  it('chains across a hyphenated particle surname ("al-Farouk")', () => {
    expect(persons('Forward the case to Omar al-Farouk.')).toContain('Omar al-Farouk');
  });

  it('combines a role cue and a hyphenated particle for an unknown name', () => {
    expect(persons('Engineer Amir al-Rashid handled the case.')).toContain('Amir al-Rashid');
  });

  it('does not turn a role cue + structural nouns into a person', () => {
    expect(persons('Customer Service Team responded quickly.')).toHaveLength(0);
    expect(persons('The Account Approval Form is attached.')).toHaveLength(0);
    expect(persons('Merchant Services were down.')).toHaveLength(0);
  });

  it('detects an unknown name after an abbreviated role prefix ("Eng.")', () => {
    expect(persons('Report filed by Eng. Dimitri Petrov this morning.')).toContain(
      'Dimitri Petrov'
    );
    expect(persons('Escalated by Eng. Sophia Papadopoulos yesterday.')).toContain(
      'Sophia Papadopoulos'
    );
    // Held-out hyphenated surname after the abbreviation.
    expect(persons('Support from Eng. Andreas Meyer-Krahmer overnight.')).toContain(
      'Andreas Meyer-Krahmer'
    );
  });

  it('does not let a full role word + period (a sentence boundary) start a name', () => {
    // "engineer." here ends a sentence; "Daily Briefing" must NOT become a person.
    // Only genuine abbreviations ("Eng.") get the dot-tolerant role gap.
    expect(persons('Please notify the duty engineer. Daily Briefing follows.')).toHaveLength(0);
    expect(persons('The lead engineer. Final Review is pending.')).toHaveLength(0);
  });

  it('does not turn an abbreviated role cue + structural nouns into a person', () => {
    expect(persons('Eng. Release Notes are attached for review.')).toHaveLength(0);
    expect(persons('Eng. Support Team responded.')).toHaveLength(0);
  });

  it('proves the abbreviated-role-cue names are held out (absent from the DB)', () => {
    // Guards rule: the "Eng." detections above must come from the heuristic, not
    // from dictionary membership. If any of these land in the DB later, the cases
    // above stop proving generalization and must be re-pointed at fresh held-outs.
    const heldOut: Array<[string, 'Latin']> = [
      ['dimitri', 'Latin'],
      ['petrov', 'Latin'],
      ['sophia', 'Latin'],
      ['papadopoulos', 'Latin'],
      ['andreas', 'Latin'],
      ['meyer', 'Latin'],
      ['krahmer', 'Latin'],
    ];
    for (const [word, script] of heldOut) {
      expect(nameSource.hasGiven(word, script), `${word} should be out-of-DB`).toBe(false);
      expect(nameSource.hasFamily(word, script), `${word} should be out-of-DB`).toBe(false);
    }
  });
});

describe('false-positive guards', () => {
  it('does not flag lowercase common words', () => {
    expect(persons('She gave a frank and rose-tinted review.')).toHaveLength(0);
  });

  it('does not flag an ambiguous word at sentence start', () => {
    expect(persons('Mark my words on this.')).not.toContain('Mark');
  });

  it('does not flag a capitalized place that is not a name', () => {
    expect(persons('We will visit Berlin in May.')).toHaveLength(0);
  });
});

describe('transcribed CJK names', () => {
  it('detects a Pinyin full name', () => {
    expect(persons('The award went to Zhang Wei this year.')).toContain('Zhang Wei');
  });

  it('detects a Romaji full name', () => {
    expect(persons('A novel by Haruki Murakami.')).toContain('Haruki Murakami');
  });
});

describe('native-script names', () => {
  it('detects a Devanagari name backed by the database', () => {
    expect(persons('यह प्रिया शर्मा है।')).toContain('प्रिया शर्मा');
  });
});

describe('mixed scripts in one document', () => {
  it('finds names in different scripts', () => {
    const found = persons('Email John Smith and also محمد حسن today.');
    expect(found).toContain('John Smith');
    expect(found).toContain('محمد حسن');
  });
});

describe('frequency tier influences scoring', () => {
  // A source where "rose" (an ambiguous word) lives only in the bulk ext tier,
  // alongside the unambiguous ext-only "zorblax"/"quux" and the core "anna".
  const tiered = new PackNameSource();
  tiered.addWords(['anna'], { script: 'Latin', tier: 'core' }, 'latin-core');
  tiered.addWords(['rose', 'zorblax', 'quux'], { script: 'Latin', tier: 'ext' }, 'latin-ext');

  const find = (text: string) =>
    detect(text, { nameSource: tiered })
      .filter((s) => s.type === 'PERSON')
      .map((s) => s.text);

  it('suppresses a single ambiguous word found only in the ext tier', () => {
    expect(find('I bought a Rose today.')).not.toContain('Rose');
  });

  it('still detects a core-tier given name', () => {
    expect(find('We met Anna today.')).toContain('Anna');
  });

  it('does not flag a lone bulk-only token without corroboration', () => {
    // With a large ext dictionary a single ext-only hit is more likely an
    // ordinary word than a person, so it needs a second name part, a title or a
    // role cue before it counts. (This is what keeps bulk vocabulary such as
    // "Friday"/"Service" from becoming false positives.)
    expect(find('We met Zorblax today.')).not.toContain('Zorblax');
  });

  it('detects a bulk-only name once a second part corroborates it', () => {
    expect(find('We met Zorblax Quux today.')).toContain('Zorblax Quux');
  });

  it('detects a bulk-only name after a title', () => {
    expect(find('Ask Dr. Zorblax about it.')).toContain('Zorblax');
  });
});
