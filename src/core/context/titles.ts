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
  // Native-script "Dr." abbreviations (Hindi डॉ., Punjabi ਡਾ., Bengali ডাঃ) —
  // the Punjabi form is also a name-pack label, so without this it was read as
  // a person on its own ("ਡਾ ਨੇ ਕਿਹਾ" = "the doctor said").
  'डॉ',
  'ਡਾ',
  'ডাঃ',
  // Thai honorifics (Mr., Mrs., Miss, Khun, Master/Miss for children, Dr.).
  // Usually glued to the given name; detectors/names.ts splits them off.
  'นาย',
  'นาง',
  'นางสาว',
  'คุณ',
  'เด็กชาย',
  'เด็กหญิง',
  'ดร',
]);

export function normalizeTitle(token: string): string {
  return token.toLowerCase().replace(/\.$/, '');
}

export function isTitle(token: string): boolean {
  return TITLES.has(normalizeTitle(token));
}
