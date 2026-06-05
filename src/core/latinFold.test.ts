import { describe, it, expect } from 'vitest';
import { latinFold } from './latinFold';

describe('latinFold', () => {
  it('strips combining marks that NFD already decomposes', () => {
    // é, ñ, ü, å, ç, ã, í — every letter+diacritic pair handled by NFD.
    expect(latinFold('García')).toBe('Garcia');
    expect(latinFold('Müller')).toBe('Muller');
    expect(latinFold('São Paulo')).toBe('Sao Paulo');
    expect(latinFold('Sigríður')).toBe('Sigridur');
  });

  it('maps precomposed Latin letters that NFD does NOT decompose', () => {
    // The reason this helper exists: these atomic codepoints survive NFD intact,
    // so the dictionary lookup never matched their native spellings.
    expect(latinFold('Jørgensen')).toBe('Jorgensen');
    expect(latinFold('Sørensen')).toBe('Sorensen');
    expect(latinFold('Łukasz')).toBe('Lukasz');
    expect(latinFold('Reuß')).toBe('Reuss');
    expect(latinFold('Aðalsteinsson')).toBe('Adalsteinsson');
    expect(latinFold('Halıcı')).toBe('Halici');
    expect(latinFold('Æthelstan')).toBe('AEthelstan');
    expect(latinFold('Lœwy')).toBe('Loewy');
  });

  it('preserves case', () => {
    expect(latinFold('JØRGENSEN')).toBe('JORGENSEN');
    expect(latinFold('ŁUKASZ')).toBe('LUKASZ');
  });

  it('leaves already-ASCII input untouched', () => {
    expect(latinFold('Smith')).toBe('Smith');
    expect(latinFold('jane.doe')).toBe('jane.doe');
  });

  it('matches the build-time asciiFold (single source of truth)', async () => {
    const { asciiFold } = await import('../../scripts/build-db/romanize-hangul');
    for (const sample of [
      'Jørgensen',
      'García',
      'Łukasz',
      'Reuß',
      'Halıcı',
      'Aðalsteinsson',
      'Þorri',
    ]) {
      expect(asciiFold(sample)).toBe(latinFold(sample));
    }
  });
});
