/**
 * Nobiliary / connective particles that join the parts of a multi-token name
 * (e.g. "von" in "Kai-Uwe von Braun", "al" in "Omar al-Farouk", "ben" in
 * "David ben Gurion"). Stored lowercased. These may appear in lowercase between
 * two capitalized name parts and should not, on their own, break a name chain.
 */
export const PARTICLES = new Set<string>([
  // German / Dutch / Nordic
  'von',
  'van',
  'der',
  'den',
  'ter',
  'ten',
  'zu',
  'zur',
  'zum',
  'af',
  'av',
  // Romance
  'de',
  'del',
  'della',
  'dello',
  'di',
  'da',
  'das',
  'dos',
  'du',
  'le',
  'la',
  'les',
  // Spanish plural definite articles inside "de los" / "de las" name chains
  // ("Maria de los Angeles", "Pedro de los Santos", "Jorge de las Mercedes"). The
  // singular forms ("el", "la") and the French plural ("les") are already here;
  // the Spanish plurals were an asymmetric omission that truncated the chain.
  'los',
  'las',
  'y', // Spanish conjunction in compound surnames
  'e', // Portuguese conjunction in compound surnames
  // Arabic / Persian (transliterated)
  'bin',
  'ibn',
  'bint',
  'al',
  'el',
  // Persian/Urdu sun-letter assimilation of the Arabic article — appears in
  // South Asian Muslim names whenever the surname's first sound absorbs the
  // lām ("Naveed ul-Haq", "Mahbub ul-Haq", "Zia ul-Haq", "Inayat ul-Allah").
  // The tokenizer keeps "ul-Haq" as a single lowercase-initial token, so
  // without "ul" in PARTICLES, particleHyphenName() fails and the chain
  // truncates at the given name even when the fused surname is in the DB.
  'ul',
  'abu',
  'abd',
  'abdel',
  'abdul',
  // Hebrew (transliterated)
  'ben',
  'bat',
  'bar',
  // South-Asian
  'das',
]);

export function isParticle(token: string): boolean {
  return PARTICLES.has(token.toLowerCase().replace(/^['’-]|['’-]$/g, ''));
}
