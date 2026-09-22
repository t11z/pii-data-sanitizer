/**
 * Street-type suffixes that close a postal street name ("Main Street", "Park
 * Avenue", "Downing Street"). Several of these also sit in the long-tail `ext`
 * surname list (Street, Lane, Court, Place, Way, …), so on their own they cannot
 * be blocked as a name part without dropping the genuine surname — "Sarah Lane"
 * is a person, not an address. They are therefore consulted ONLY together with a
 * preceding house number (see `detectNames`): the number is the disambiguator
 * that turns "<Cap chain> <suffix>" from a possible surname into an address, so
 * name recall on bare "<Given> <Suffix-surname>" is untouched.
 *
 * Full words only — abbreviations like "St." / "Ave." are deliberately excluded
 * because "St" collides with the "Saint" honorific and the trailing-dot forms
 * open a separate ambiguity we don't need for the address cue. Stored lowercased;
 * looked up on the ASCII-folded surface form so accented spellings still match.
 */
export const STREET_SUFFIXES = new Set<string>([
  'street',
  'avenue',
  'boulevard',
  'road',
  'lane',
  'drive',
  'court',
  'place',
  'way',
  'highway',
  'freeway',
  'terrace',
  'parkway',
  'plaza',
  'square',
  'circle',
  'alley',
  'close',
  'crescent',
  'row',
]);

export function isStreetSuffix(lower: string): boolean {
  return STREET_SUFFIXES.has(lower);
}
