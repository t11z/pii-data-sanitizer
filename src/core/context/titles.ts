/**
 * Honorifics / titles that strongly signal a following person name. Stored
 * lowercased and without a trailing dot; lookups normalize the candidate the
 * same way.
 */
export const TITLES = new Set<string>([
  // English
  'mr',
  'mrs',
  'ms',
  'miss',
  'mx',
  'dr',
  'prof',
  'sir',
  'madam',
  'lord',
  'lady',
  'rev',
  'hon',
  'capt',
  'sgt',
  'col',
  'gen',
  // German
  'herr',
  'frau',
  'frl',
  // French / Spanish / Italian / Portuguese
  'm',
  'mme',
  'mlle',
  'sr',
  'sra',
  'srta',
  'don',
  'dona',
  'dom',
  // Arabic / Persian / South-Asian honorifics (transliterated)
  'sheikh',
  'shaikh',
  'sayyid',
  'sayed',
  'hajj',
  'haji',
  'imam',
  'mullah',
  'ustad',
  'shri',
  'smt',
  'kumari',
  // Hebrew (transliterated)
  'rav',
  'rabbi',
]);

export function normalizeTitle(token: string): string {
  return token.toLowerCase().replace(/\.$/, '');
}

export function isTitle(token: string): boolean {
  return TITLES.has(normalizeTitle(token));
}
