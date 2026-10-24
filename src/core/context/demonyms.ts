/**
 * Nationality / language DEMONYMS in their adjectival form ("German", "Dutch",
 * "Portuguese", "Russian"). In KYC / support / compliance prose these words sit
 * in front of a document- or identifier-type noun — "German Tax ID", "Dutch
 * IBAN", "Russian passport", "Portuguese fiscal number" — describing *which*
 * country's identifier follows. They are never a person name in that position.
 *
 * Why this is a precision lever, not vocabulary. Many demonyms collide with the
 * long-tail (`ext`) surname lists the engine ingests ("German", "French",
 * "Dutch", "Russian", "Greek", "Czech", "Danish", "Welsh", "Swiss", … are all
 * real census surnames). When a demonym opens a sentence and a capitalized
 * identifier noun follows, the name detector reads the pair as a two-token
 * PERSON span ("German Tax", "Dutch IBAN") — a whole *class* of false
 * positives, one per nationality, that no amount of dictionary tuning fixes.
 * Treating the adjectival demonym as a non-name word (see `isNonNameWord`)
 * blocks the class structurally: the demonym can neither anchor a chain at a
 * sentence start nor be absorbed as a name part.
 *
 * The trade-off mirrors the one `NON_NAME_WORDS` already makes for "Manager" /
 * "Lead" / "Head": the rare genuine *surname* spelled like a demonym ("Dawn
 * French", "Herr German") is given up, which is acceptable under the
 * precision-first rule — and none of these collide with the curated `core`
 * given/family lists (only the long-tail `ext` tier), so common names are
 * untouched. Only the adjectival form is listed; country *nouns* ("Germany",
 * "France") are handled elsewhere (the AKA-in-parens country guard), and noun
 * demonyms that are ordinary given names ("Jordan" vs. the demonym "Jordanian")
 * are deliberately excluded so real names are not swept in.
 *
 * Source: nationality adjectivals are common-knowledge, public-domain English
 * vocabulary (not a licensed name dataset). Stored lowercased, matched
 * case-insensitively.
 */
export const DEMONYMS = new Set<string>([
  // Europe
  'german',
  'dutch',
  'french',
  'spanish',
  'italian',
  'portuguese',
  'belgian',
  'austrian',
  'swiss',
  'british',
  'english',
  'scottish',
  'welsh',
  'irish',
  'danish',
  'swedish',
  'norwegian',
  'finnish',
  'icelandic',
  'polish',
  'czech',
  'slovak',
  'hungarian',
  'romanian',
  'bulgarian',
  'greek',
  'turkish',
  'russian',
  'ukrainian',
  'serbian',
  'croatian',
  'slovenian',
  'slovene',
  'bosnian',
  'albanian',
  'estonian',
  'latvian',
  'lithuanian',
  'maltese',
  'cypriot',
  'luxembourgish',
  // Americas
  'american',
  'canadian',
  'mexican',
  'brazilian',
  'argentine',
  'argentinian',
  'chilean',
  'colombian',
  'peruvian',
  'venezuelan',
  'cuban',
  'bolivian',
  'ecuadorian',
  'uruguayan',
  'paraguayan',
  // Asia & Middle East
  'chinese',
  'japanese',
  'korean',
  'indian',
  'pakistani',
  'bangladeshi',
  'indonesian',
  'malaysian',
  'thai',
  'vietnamese',
  'filipino',
  'singaporean',
  'taiwanese',
  'nepali',
  'nepalese',
  'mongolian',
  'kazakh',
  'uzbek',
  'afghan',
  'iranian',
  'iraqi',
  'israeli',
  'saudi',
  'emirati',
  'qatari',
  'kuwaiti',
  'lebanese',
  'syrian',
  'jordanian',
  'yemeni',
  'omani',
  // Africa
  'egyptian',
  'moroccan',
  'algerian',
  'tunisian',
  'libyan',
  'nigerian',
  'kenyan',
  'ghanaian',
  'ethiopian',
  'sudanese',
  'somali',
  'ugandan',
  'tanzanian',
  'zambian',
  'zimbabwean',
  'angolan',
  'senegalese',
  'cameroonian',
  // Oceania
  'australian',
  'fijian',
]);

/** True when `token` is a nationality / language demonym in adjectival form. */
export function isDemonym(token: string): boolean {
  return DEMONYMS.has(token.toLowerCase());
}
