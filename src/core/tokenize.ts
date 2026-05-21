import type { Script, Token } from './types';

// A word is a run of letters/marks, optionally joined internally by hyphens or
// apostrophes (so "Kai-Uwe" and "O'Brien" stay single tokens).
const WORD_RE = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;

const SCRIPT_TESTS: Array<[Script, RegExp]> = [
  ['Latin', /\p{Script=Latin}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
  ['Han', /\p{Script=Han}/u],
];

export function detectScript(text: string): Script {
  for (const ch of text) {
    if (/[\p{M}]/u.test(ch)) continue;
    for (const [script, re] of SCRIPT_TESTS) {
      if (re.test(ch)) return script;
    }
    if (/\p{L}/u.test(ch)) return 'Other';
  }
  return 'Other';
}

/** Splits text into script-tagged word tokens with offsets into `text`. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD_RE)) {
    const value = match[0];
    const start = match.index;
    tokens.push({
      text: value,
      start,
      end: start + value.length,
      script: detectScript(value),
    });
  }
  return tokens;
}
