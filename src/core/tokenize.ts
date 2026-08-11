import type { Script, Token } from './types';

// A word is a run of letters/marks, optionally joined internally by hyphens or
// apostrophes (so "Kai-Uwe" and "O'Brien" stay single tokens).
const WORD_RE = /[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu;

// Trailing English/German possessive clitic ("Khalid's", "James's"). It is not
// part of the name, so it is trimmed from the token — letting a possessive
// mention be recognized and linked like the bare name. "O'Brien"/"D'Angelo" keep
// their internal apostrophe (they do not end in apostrophe-s).
const POSSESSIVE_CLITIC = /['’]s$/i;

const SCRIPT_TESTS: Array<[Script, RegExp]> = [
  ['Latin', /\p{Script=Latin}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Bengali', /\p{Script=Bengali}/u],
  ['Tamil', /\p{Script=Tamil}/u],
  ['Telugu', /\p{Script=Telugu}/u],
  ['Gujarati', /\p{Script=Gujarati}/u],
  ['Kannada', /\p{Script=Kannada}/u],
  ['Malayalam', /\p{Script=Malayalam}/u],
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
    let value = match[0];
    const start = match.index;
    // Drop a trailing possessive clitic, but only when a real word remains, so
    // the span covers just the name ("Khalid's notes" → name "Khalid").
    const clitic = POSSESSIVE_CLITIC.exec(value);
    if (clitic && value.length - clitic[0].length >= 2) {
      value = value.slice(0, value.length - clitic[0].length);
    }
    tokens.push({
      text: value,
      start,
      end: start + value.length,
      script: detectScript(value),
    });
  }
  return tokens;
}
