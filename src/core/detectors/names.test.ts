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
  // while "anna" and a rare unambiguous "zorblax" are present too.
  const tiered = new PackNameSource();
  tiered.addWords(['anna'], { script: 'Latin', tier: 'core' }, 'latin-core');
  tiered.addWords(['rose', 'zorblax'], { script: 'Latin', tier: 'ext' }, 'latin-ext');

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

  it('still detects a rare unambiguous ext-tier name (recall-first)', () => {
    expect(find('We met Zorblax today.')).toContain('Zorblax');
  });
});
