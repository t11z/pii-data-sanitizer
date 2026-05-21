/**
 * Words that are both common given/family names AND ordinary vocabulary
 * ("Frank", "Rose", "Mark", "Will", months, "Berlin" ...). A capitalized token
 * from this set needs extra context (a title, or being part of a multi-token
 * name) before it is treated as PII, which keeps single-word false positives in
 * check. Stored lowercased.
 */
export const AMBIGUOUS_WORDS = new Set<string>([
  // English given names that are also words
  'frank',
  'mark',
  'will',
  'rose',
  'daisy',
  'lily',
  'grace',
  'hope',
  'faith',
  'joy',
  'art',
  'bill',
  'guy',
  'jack',
  'mason',
  'baker',
  'hunter',
  'rich',
  'sunny',
  'crystal',
  'dawn',
  'summer',
  'autumn',
  'jean',
  'jay',
  'ray',
  'dean',
  'earl',
  'max',
  // Months (often mistaken for given names)
  'april',
  'may',
  'june',
  'august',
  // Common surnames that are also words / places
  'berlin',
  'king',
  'young',
  'long',
  'brown',
  'white',
  'green',
  'black',
  'gray',
  'cook',
  'fisher',
  'carpenter',
  'gardener',
  // Pinyin syllables that collide with English words
  'an',
  'he',
  'wei',
  'han',
  'bin',
  'wan',
  'min',
  'lan',
  'yang',
  'song',
  'tang',
]);

export function isAmbiguousWord(lower: string): boolean {
  return AMBIGUOUS_WORDS.has(lower);
}
