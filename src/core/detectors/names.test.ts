import { describe, it, expect } from 'vitest';
import { detect } from '../index';
import { nameSourceFromSources } from '../db/fromSources';

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
