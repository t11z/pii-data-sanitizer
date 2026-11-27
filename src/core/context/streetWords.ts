import { latinFold } from '../latinFold';

/**
 * Multilingual thoroughfare generics — the "street"/"road"/"square" designators
 * that head or tail a street address ("Rue de Rivoli", "Via Garibaldi", "Calle
 * Mayor", "Baker Street", "Bahnhofstraße").
 *
 * These are the words whose dictionary collisions `context/roleWords.ts`
 * deliberately does NOT put in `NON_NAME_WORDS`: many are real census surnames
 * on file ("Rue", "Via", "Calle", "Street", "Platz", "Rua", "Lane", "Place"),
 * so unconditionally blocking them would break a genuine person ("Diane Lane",
 * "Julie Street") — a missed name is a leak, worse than the over-redaction of a
 * "Baker Street" span. That comment in `roleWords.ts` names the escape hatch
 * exactly: guard them only behind "a structural gate (house number /
 * preposition) [that] can tell the two apart."
 *
 * This set is that structural gate's vocabulary. It is consulted ONLY in
 * `detectors/names.ts` when a PERSON chain also sits directly after a house
 * number (`<digits> <chain>`) — the unambiguous address shape. Because the
 * house-number context is what licenses the suppression, the set can safely
 * include the surname-colliding generics: without a leading number ("Diane
 * Lane", "Rue phoned") nothing here fires, so real people keep detecting.
 *
 * Stored lowercased and matched with a Latin diacritic fold (so "Straße" →
 * "strasse", "Allée" → "allee", "Travesía" → "travesia" all hit the folded
 * entry), mirroring the fold already used for name lookups.
 */
export const STREET_WORDS = new Set<string>([
  // English (the ambiguous surname-colliders roleWords.ts had to exclude, now
  // safe behind the house-number gate: Street/Lane/Place/Drive/Court/…).
  'street',
  'streets',
  'avenue',
  'avenues',
  'boulevard',
  'road',
  'lane',
  'drive',
  'court',
  'place',
  'square',
  'crescent',
  'close',
  'terrace',
  'way',
  'walk',
  'row',
  'alley',
  'plaza',
  'highway',
  'parkway',
  // French
  'rue',
  'impasse',
  'allee', // allée
  'quai',
  'chemin',
  'cours',
  'passage',
  'voie',
  'sentier',
  // Italian
  'via',
  'viale',
  'vicolo',
  'piazza',
  'piazzale',
  'corso',
  'strada',
  'largo',
  // Spanish / Catalan
  'calle',
  'avenida',
  'paseo',
  'carrer',
  'ronda',
  'camino',
  'rambla',
  'carretera',
  'callejon', // callejón
  'travesia', // travesía
  // German
  'strasse', // straße / strasse
  'platz',
  'gasse',
  'weg',
  'chaussee',
  'ufer',
  'damm',
  'steig',
  // Portuguese
  'rua',
  'travessa',
  'alameda',
  'praca', // praça
  'estrada',
  'beco',
  // Dutch
  'straat',
  'laan',
  'gracht',
  'plein',
  'kade',
  'steeg',
  'singel',
  // Scandinavian
  'gata',
  'gatan',
  'gate',
  'vei',
  'vej',
  'vag', // väg
  'vagen', // vägen
  'torg',
  'plass',
  // Finnish
  'katu',
  'tie',
  'kuja',
  // Polish / Slavic (transliterated)
  'ulica',
  'plac',
  'aleja',
  'prospekt',
  // Hungarian
  'utca',
  'korut', // körút
]);

/**
 * True when the token is a thoroughfare generic (street / road / square
 * designator) in any supported language. Latin diacritic fold mirrors the name
 * lookups so accented spellings ("Straße", "Allée") still match.
 */
export function isStreetWord(token: string): boolean {
  const l = token.toLowerCase();
  if (STREET_WORDS.has(l)) return true;
  const folded = latinFold(l);
  return folded !== l && STREET_WORDS.has(folded);
}
