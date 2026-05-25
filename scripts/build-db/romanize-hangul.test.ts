import { describe, it, expect } from 'vitest';
import { romanizeHangul, asciiFold, SURNAME_OVERRIDES } from './romanize-hangul';

describe('romanizeHangul', () => {
  it('romanizes given names by Revised Romanization', () => {
    expect(romanizeHangul('민준')).toBe('minjun');
    expect(romanizeHangul('서연')).toBe('seoyeon');
    expect(romanizeHangul('지호')).toBe('jiho');
  });

  it('handles the silent ㅇ initial and final consonants', () => {
    expect(romanizeHangul('연')).toBe('yeon'); // silent initial + final ㄴ
    expect(romanizeHangul('강')).toBe('gang'); // final ㅇ → ng
    expect(romanizeHangul('박')).toBe('bak'); // RR form (override gives "park")
  });

  it('lowercases and passes non-Hangul characters through unchanged', () => {
    expect(romanizeHangul('linh')).toBe('linh');
    expect(romanizeHangul('김2')).toBe('gim2');
  });
});

describe('SURNAME_OVERRIDES', () => {
  it('carries conventional surname spellings that RR would miss', () => {
    expect(SURNAME_OVERRIDES['김']).toContain('kim');
    expect(SURNAME_OVERRIDES['이']).toEqual(expect.arrayContaining(['lee', 'yi']));
    expect(SURNAME_OVERRIDES['박']).toContain('park');
    // RR of these surnames differs from the conventional spelling.
    expect(romanizeHangul('김')).toBe('gim');
    expect(romanizeHangul('이')).toBe('i');
  });
});

describe('asciiFold', () => {
  it('strips Vietnamese diacritics including đ', () => {
    expect(asciiFold('nguyễn')).toBe('nguyen');
    expect(asciiFold('đức')).toBe('duc');
    expect(asciiFold('phạm')).toBe('pham');
  });

  it('leaves plain ASCII unchanged', () => {
    expect(asciiFold('linh')).toBe('linh');
  });
});
