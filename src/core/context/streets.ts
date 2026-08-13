/**
 * Thoroughfare-suffix guard for the name chain. A capitalized word directly
 * followed by a street type ("Baker Street", "Sunset Boulevard", "Sunny Lane")
 * is an address, not a person — but the two tokens each look like a name part
 * (many street types double as census surnames, and the leading word is
 * routinely a given name or surname too), so the chain detector otherwise emits
 * the whole street as a PERSON span.
 *
 * The list is split by how much a suffix collides with real family names,
 * because the fix must not start dropping genuine people:
 *
 *   - UNAMBIGUOUS types ("Street", "Avenue", "Boulevard", "Drive", …) are
 *     essentially never Latin surnames, so a preceding capitalized word is a
 *     street name in every realistic sentence. These break the chain
 *     unconditionally. The only casualty is the rare literal surname (e.g. the
 *     skier "Picabo Street"), the same precision-first trade the engine already
 *     accepts for the "Head" / "Lead" structural nouns in `roleWords.ts`.
 *
 *   - AMBIGUOUS types ("Lane", "Court", "Way", "Place", "Park", …) are common
 *     surnames in their own right — "Nathan Lane", "Margaret Court", "Faith
 *     Hill" — so blocking them outright would create false negatives. They are
 *     treated as a street ONLY when an address signal precedes the span: a
 *     leading house number ("42 Sunny Lane", "221B Baker Street"). Absent that
 *     number the suffix stays a valid surname and the person still detects.
 *
 * Word data only, matched case-insensitively; the caller supplies the
 * house-number context. Kept out of `NON_NAME_WORDS` on purpose: those block a
 * token everywhere, which would wrongly kill the ambiguous surnames.
 */

/** Street types that are essentially never Latin family names. */
const UNAMBIGUOUS_STREET_SUFFIXES = new Set<string>([
  'street',
  'avenue',
  'boulevard',
  'drive',
  'road',
  'highway',
  'freeway',
  'parkway',
  'motorway',
  'expressway',
  'terrace',
  'plaza',
  'alley',
  'esplanade',
  'crescent',
]);

/** Street types that are also common surnames — only address context makes them a street. */
const AMBIGUOUS_STREET_SUFFIXES = new Set<string>([
  'lane',
  'court',
  'way',
  'place',
  'park',
  'green',
  'hill',
  'row',
  'walk',
  'grove',
  'close',
  'gardens',
  'mews',
  'square',
  'circle',
]);

export type StreetSuffixKind = 'unambiguous' | 'ambiguous' | null;

/** Classify a token as a thoroughfare suffix (see the two sets above). */
export function streetSuffixKind(token: string): StreetSuffixKind {
  const l = token.toLowerCase();
  if (UNAMBIGUOUS_STREET_SUFFIXES.has(l)) return 'unambiguous';
  if (AMBIGUOUS_STREET_SUFFIXES.has(l)) return 'ambiguous';
  return null;
}

/** True when a street type is unambiguous (never a real surname). */
export function isUnambiguousStreetSuffix(token: string): boolean {
  return UNAMBIGUOUS_STREET_SUFFIXES.has(token.toLowerCase());
}

// A house number immediately preceding the span: a run that starts with a digit
// ("42", "221B", "1600"), then whitespace, at the very end of the lead-in text.
// This is the address cue that turns an ambiguous surname suffix ("Lane") into a
// street type — "42 Sunny Lane" is an address, "Nathan Lane" is a person.
const HOUSE_NUMBER_LEAD = /\d[\p{L}\p{N}-]*\s+$/u;

/**
 * True when the text ending at `spanStart` (the raw source up to the name's
 * first token) ends in a house number — the address context that licenses
 * blocking an ambiguous street suffix.
 */
export function hasHouseNumberBefore(text: string, spanStart: number): boolean {
  return HOUSE_NUMBER_LEAD.test(text.slice(0, spanStart));
}
