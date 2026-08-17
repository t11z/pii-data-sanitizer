/**
 * Ingests names from Wikidata (CC0) into committed data files under
 * scripts/build-db/data/<script>.json. The build (build.ts) merges these with
 * the curated sources to produce the runtime packs. Run with: `npm run ingest`.
 *
 * Network is used here only (and only at maintainer/CI build time) — never in
 * the browser. Wikidata is CC0, so the result is safe to commit. Labels are
 * bucketed by their detected script, lowercased, deduped, and (for full-name
 * labels) split into single tokens so they match individual words.
 *
 * Harvesting is PER LANGUAGE, from three complementary pools:
 *   1. Dedicated given/family name items (+ alt-labels) — clean, but sparse for
 *      native scripts (Wikidata only has ~dozens of Devanagari name items).
 *   2. Romanized people: humans (Q5) by major Latin-label language — a large
 *      pool of real given+family names (romanized names are first-class here).
 *   3. Regional people by COUNTRY + label language — both native-script and
 *      romanized (English) labels of people from India, Iran, Pakistan, Egypt,
 *      Israel, … This is the reliable lever for native Hindi/Arabic/Hebrew:
 *      constraining the human set by country keeps the query cheap (a raw
 *      `Q5 + native-label` query times out on the public endpoint).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectScript } from '../../src/core/tokenize';
import { isNonNameWord } from '../../src/core/context/roleWords';
import type { Script } from '../../src/core/types';
import { romanizeHangul, asciiFold, SURNAME_OVERRIDES } from './romanize-hangul';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'pii-data-sanitizer/0.1 (https://github.com/t11z/pii-data-sanitizer)';
const LICENSE = 'Wikidata (CC0)';

// Name-item label languages, grouped by the script they predominantly yield.
const LATIN_LANGS = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'nl',
  'pl',
  'sv',
  'da',
  'nb',
  'fi',
  'cs',
  'ro',
  'hu',
  'tr',
  'id',
  'ca',
];
const CYRILLIC_LANGS = ['ru', 'uk', 'bg', 'sr', 'be', 'mk'];
const ARABIC_LANGS = ['ar', 'fa', 'ur', 'ps', 'ckb', 'sd'];
const HEBREW_LANGS = ['he', 'yi'];
const DEVANAGARI_LANGS = ['hi', 'mr', 'ne', 'sa'];
const HANGUL_LANGS = ['ko'];
const BENGALI_LANGS = ['bn'];
const TAMIL_LANGS = ['ta'];
const TELUGU_LANGS = ['te'];
const GUJARATI_LANGS = ['gu'];
const KANNADA_LANGS = ['kn'];
const MALAYALAM_LANGS = ['ml'];
const THAI_LANGS = ['th'];

const NATIVE_LANGS = [
  ...CYRILLIC_LANGS,
  ...ARABIC_LANGS,
  ...HEBREW_LANGS,
  ...DEVANAGARI_LANGS,
  ...HANGUL_LANGS,
  ...BENGALI_LANGS,
  ...TAMIL_LANGS,
  ...TELUGU_LANGS,
  ...GUJARATI_LANGS,
  ...KANNADA_LANGS,
  ...MALAYALAM_LANGS,
  ...THAI_LANGS,
];

// Humans (Q5) by major Latin label language — fast, large romanized-name pool.
const HUMAN_LATIN_LANGS = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl'];

// Regional humans by [countryQID, labelLang]. Country constrains the set so the
// query is cheap; the label language picks native script or romanized (en). This
// is the reliable lever for regions whose names are sparse as dedicated name
// items — including Korea (Hangul), Vietnam (Latin w/ diacritics), and
// sub-Saharan Africa (mostly Latin). A bare `Q5 + native-label` query times out.
const HUMAN_BY_COUNTRY: Array<[string, string]> = [
  // Cyrillic: the largest world script previously entirely absent from the name
  // database (~250M speakers across Russia, Ukraine, the Balkans, and Central
  // Asia). Cyrillic is bicameral, so native labels detect through the same
  // capitalization-gated path as Latin (see isBicameralNameScript in names.ts).
  // English (en) labels feed the Latin pack as romanized forms via the entries
  // that already exist for the generic sweep; these add the native-script forms.
  ['wd:Q159', 'ru'], // Russia
  ['wd:Q212', 'uk'],
  ['wd:Q212', 'ru'], // Ukraine
  ['wd:Q184', 'be'],
  ['wd:Q184', 'ru'], // Belarus
  ['wd:Q219', 'bg'], // Bulgaria
  ['wd:Q403', 'sr'], // Serbia
  ['wd:Q221', 'mk'], // North Macedonia
  ['wd:Q232', 'kk'],
  ['wd:Q232', 'ru'], // Kazakhstan
  ['wd:Q813', 'ky'],
  ['wd:Q813', 'ru'], // Kyrgyzstan
  ['wd:Q863', 'tg'],
  ['wd:Q863', 'ru'], // Tajikistan
  ['wd:Q711', 'mn'], // Mongolia
  ['wd:Q236', 'sr'], // Montenegro
  ['wd:Q668', 'hi'],
  ['wd:Q668', 'mr'],
  ['wd:Q668', 'sa'],
  ['wd:Q668', 'en'], // India
  ['wd:Q837', 'ne'],
  ['wd:Q837', 'en'], // Nepal
  ['wd:Q794', 'fa'],
  ['wd:Q794', 'en'], // Iran
  ['wd:Q843', 'ur'],
  ['wd:Q843', 'en'], // Pakistan
  ['wd:Q889', 'ps'],
  ['wd:Q889', 'fa'],
  ['wd:Q889', 'en'], // Afghanistan
  ['wd:Q79', 'ar'],
  ['wd:Q79', 'en'], // Egypt
  ['wd:Q851', 'ar'], // Saudi Arabia
  ['wd:Q796', 'ar'], // Iraq
  ['wd:Q822', 'ar'], // Lebanon
  ['wd:Q878', 'ar'], // United Arab Emirates
  ['wd:Q801', 'he'],
  ['wd:Q801', 'en'], // Israel
  // East Asia: Korean native (ko → Hangul) is romanized at ingest; Vietnamese
  // (vi) is Latin with diacritics, ASCII-folded at ingest.
  ['wd:Q884', 'ko'],
  ['wd:Q884', 'en'], // South Korea
  ['wd:Q881', 'vi'],
  ['wd:Q881', 'en'], // Vietnam
  // Sub-Saharan Africa: native labels are Latin script (Yoruba, Igbo, Hausa,
  // Swahili, Zulu, Xhosa, Akan/Twi/Ewe, Shona, Wolof, Afrikaans) + romanized en.
  ['wd:Q1033', 'yo'],
  ['wd:Q1033', 'ig'],
  ['wd:Q1033', 'ha'],
  ['wd:Q1033', 'en'], // Nigeria
  ['wd:Q117', 'ak'],
  ['wd:Q117', 'tw'],
  ['wd:Q117', 'ee'],
  ['wd:Q117', 'en'], // Ghana
  ['wd:Q114', 'sw'],
  ['wd:Q114', 'en'], // Kenya
  ['wd:Q258', 'zu'],
  ['wd:Q258', 'xh'],
  ['wd:Q258', 'af'],
  ['wd:Q258', 'en'], // South Africa
  ['wd:Q924', 'sw'],
  ['wd:Q924', 'en'], // Tanzania
  ['wd:Q1036', 'sw'],
  ['wd:Q1036', 'en'], // Uganda
  ['wd:Q115', 'am'],
  ['wd:Q115', 'en'], // Ethiopia
  ['wd:Q954', 'sn'],
  ['wd:Q954', 'en'], // Zimbabwe
  ['wd:Q1041', 'wo'],
  ['wd:Q1041', 'fr'],
  ['wd:Q1041', 'en'], // Senegal
  // Bengali: Bangladesh (native Bengali script) and Indian Bengali (West Bengal).
  // Bengali is the 5th most spoken language by native speakers and was previously
  // entirely uncovered — no Bengali-script names were in any pack.
  ['wd:Q902', 'bn'],
  ['wd:Q902', 'en'], // Bangladesh
  ['wd:Q668', 'bn'], // India (West Bengal, Bengali-speaking population)
  // Tamil: major Dravidian language (80M+ speakers) with its own script.
  ['wd:Q668', 'ta'], // India (Tamil Nadu)
  ['wd:Q854', 'ta'],
  ['wd:Q854', 'en'], // Sri Lanka
  // Hangul: North Korean people carry Korean names distinct from South Korean
  // Wikidata coverage, filling out the Hangul pack's remaining 4 000+ slots.
  ['wd:Q423', 'ko'],
  ['wd:Q423', 'en'], // North Korea
  // Latin-script Africa: French/Portuguese-medium countries with large name pools
  // that were absent from the Latin pack. Order matters — these run before the
  // large European name-item sweep so they claim their cap slots.
  ['wd:Q974', 'fr'],
  ['wd:Q974', 'sw'], // DR Congo (Lingala/Swahili population)
  ['wd:Q1037', 'rw'],
  ['wd:Q1037', 'fr'],
  ['wd:Q1037', 'en'], // Rwanda
  ['wd:Q1009', 'fr'],
  ['wd:Q1009', 'en'], // Cameroon
  ['wd:Q916', 'pt'],
  ['wd:Q916', 'en'], // Angola
  ['wd:Q1029', 'pt'],
  ['wd:Q1029', 'en'], // Mozambique
  ['wd:Q1008', 'fr'],
  ['wd:Q1008', 'en'], // Côte d'Ivoire
  ['wd:Q965', 'fr'],
  ['wd:Q965', 'en'], // Burkina Faso
  ['wd:Q912', 'fr'],
  ['wd:Q912', 'en'], // Mali
  ['wd:Q1045', 'so'],
  ['wd:Q1045', 'en'], // Somalia (Somali is Latin-script)
  // Latin-script Asia: Philippines has 110M+ people whose names are Latin-script
  // but were not present at all.
  ['wd:Q928', 'tl'],
  ['wd:Q928', 'ceb'],
  ['wd:Q928', 'en'], // Philippines
  // Tamil expansion: Malaysia (~2M Tamil speakers) and Singapore (Tamil official
  // language) were absent despite covering India and Sri Lanka. Latin-script Tamil
  // names in Malaysia also feed the Latin pack via ASCII-fold.
  ['wd:Q833', 'ta'],
  ['wd:Q833', 'en'], // Malaysia
  ['wd:Q334', 'ta'],
  ['wd:Q334', 'en'], // Singapore
  // Four major Indian scripts previously entirely absent from the name database.
  // Combined 200M+ native speakers; country-constrained queries keep the SPARQL
  // endpoint from timing out. English labels go into the Latin pack via the
  // existing ['wd:Q668', 'en'] entry above; these add the native-script forms.
  ['wd:Q668', 'te'], // India — Telugu (Andhra Pradesh, Telangana; 80M+ speakers)
  ['wd:Q668', 'gu'], // India — Gujarati (Gujarat, Rajasthan; 50M+ speakers)
  ['wd:Q668', 'kn'], // India — Kannada (Karnataka; 44M+ speakers)
  ['wd:Q668', 'ml'], // India — Malayalam (Kerala; 35M+ speakers)
  // Thai: Thailand's national script (~70M speakers), previously entirely absent.
  // Thai is caseless (unicameral), so native labels match purely by dictionary
  // membership (see isCaselessNameScript in names.ts). English (en) labels feed
  // the Latin pack as romanized forms; the 'th' labels add the native-script forms.
  ['wd:Q869', 'th'],
  ['wd:Q869', 'en'], // Thailand
];

const GIVEN_CLASSES = ['wd:Q202444', 'wd:Q12308941', 'wd:Q11879590', 'wd:Q3409032'];
const FAMILY_CLASS = 'wd:Q101352';

// Per-script caps to keep the committed data bounded. Latin is roomier than the
// other scripts because it also absorbs romanized Korean and ASCII-folded
// Vietnamese/African variants generated at ingest time (see add()).
const CAPS: Record<string, number> = {
  Latin: 150000,
  Cyrillic: 20000,
  Arabic: 20000,
  Hebrew: 10000,
  Devanagari: 20000,
  Hangul: 15000,
  Bengali: 20000,
  Tamil: 20000,
  Telugu: 20000,
  Gujarati: 20000,
  Kannada: 20000,
  Malayalam: 20000,
  Thai: 20000,
};

// Romanized/ASCII-folded variants shorter than this are dropped: 2-letter
// transliterations (e.g. RR "na", "an") collide with ordinary words and would
// add false positives. Native-script tokens keep the length-2 floor below.
const MIN_VARIANT_LEN = 3;

const LIMIT_NAME_ITEM = 8000;
const LIMIT_ALT = 5000;
const LIMIT_HUMAN = 5000;

const TOKEN_RE = /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u;
const PAREN_RE = /\s*\([^)]*\)\s*/g;

const buckets = new Map<Script, Set<string>>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function query(sparql: string): Promise<string[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50_000);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        console.warn(`    HTTP ${res.status}`);
        return [];
      }
      const json = (await res.json()) as {
        results: { bindings: Array<{ label: { value: string } }> };
      };
      return json.results.bindings.map((b) => b.label.value);
    } catch (err) {
      if (attempt < 1) {
        await sleep(2000);
        continue;
      }
      console.warn(`    ${(err as Error).message}`);
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

/** Adds a single cleaned, lowercased token to a script bucket, honoring its cap.
 * Tokens the engine treats as structural non-name words (e.g. "service", "team")
 * are skipped: bulk human labels contain such words, and ingesting them as names
 * makes phrases like "Customer Service Team" detect as a person. */
function addToBucket(script: Script, name: string): void {
  if (!CAPS[script] || !TOKEN_RE.test(name) || isNonNameWord(name)) return;
  let set = buckets.get(script);
  if (!set) {
    set = new Set();
    buckets.set(script, set);
  }
  if (set.size < CAPS[script]) set.add(name);
}

/**
 * Adds harvested labels to the script buckets. `split` tokenizes multi-word
 * labels on whitespace (for human/full-name labels); name-item labels are
 * single tokens and only need parenthetical disambiguation stripped.
 *
 * Native Korean (Hangul) tokens are also self-transliterated to Latin (Revised
 * Romanization + conventional surname overrides) so romanized text matches.
 * Latin tokens with diacritics (Vietnamese, accented African) additionally get
 * an ASCII-folded Latin variant. Both forms are kept.
 */
function add(labels: string[], split: boolean): void {
  for (const raw of labels) {
    const cleaned = raw.replace(PAREN_RE, ' ').trim();
    const parts = split ? cleaned.split(/\s+/) : [cleaned];
    for (const part of parts) {
      const name = part.trim().toLowerCase();
      if (name.length < 2 || !TOKEN_RE.test(name)) continue;
      const script = detectScript(name);
      if (script === 'Han' || script === 'Other' || !CAPS[script]) continue;

      addToBucket(script, name);

      if (script === 'Hangul') {
        const roman = romanizeHangul(name);
        if (roman.length >= MIN_VARIANT_LEN) addToBucket('Latin', roman);
        for (const override of SURNAME_OVERRIDES[name] ?? []) {
          if (override.length >= MIN_VARIANT_LEN) addToBucket('Latin', override);
        }
      } else if (script === 'Latin') {
        const folded = asciiFold(name);
        if (folded !== name && folded.length >= MIN_VARIANT_LEN) addToBucket('Latin', folded);
      }
    }
  }
}

function total(): number {
  return [...buckets.values()].reduce((n, s) => n + s.size, 0);
}

const givenQuery = (lang: string): string => `SELECT ?label WHERE {
  ?n wdt:P31 ?c . VALUES ?c { ${GIVEN_CLASSES.join(' ')} }
  ?n rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT ${LIMIT_NAME_ITEM}`;

const familyQuery = (lang: string): string => `SELECT ?label WHERE {
  ?n wdt:P31 ${FAMILY_CLASS} .
  ?n rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT ${LIMIT_NAME_ITEM}`;

// Only given-name classes here: adding the family class (Q101352, millions of
// instances) to a native-language alt-label scan times out on the endpoint.
const altLabelQuery = (lang: string): string => `SELECT ?label WHERE {
  ?n wdt:P31 ?c . VALUES ?c { ${GIVEN_CLASSES.join(' ')} }
  ?n skos:altLabel ?label . FILTER(LANG(?label)="${lang}")
} LIMIT ${LIMIT_ALT}`;

const humanLatinQuery = (lang: string): string => `SELECT ?label WHERE {
  ?p wdt:P31 wd:Q5 .
  ?p rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT ${LIMIT_HUMAN}`;

const humanCountryQuery = (country: string, lang: string): string => `SELECT ?label WHERE {
  ?p wdt:P27 ${country} .
  ?p rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT ${LIMIT_HUMAN}`;

async function run(label: string, sparql: string, split: boolean): Promise<void> {
  const before = total();
  add(await query(sparql), split);
  console.log(`  ${label.padEnd(28)} +${total() - before}  (total ${total()})`);
  await sleep(300);
}

async function main(): Promise<void> {
  // Order matters because the Latin bucket is capped: harvest the regional and
  // native pools FIRST so under-represented regions (Korea, Vietnam, sub-Saharan
  // Africa, …) get their slots, then let the large generic European pool fill the
  // remainder. (Previously the European bulk saturated the Latin cap before the
  // regional country queries ran, dropping Vietnamese/African names entirely.)
  console.log('Native name items + alt-labels…');
  for (const lang of NATIVE_LANGS) {
    await run(`given:${lang}`, givenQuery(lang), false);
    await run(`alt:${lang}`, altLabelQuery(lang), true);
  }

  console.log('Regional people by country + language…');
  for (const [country, lang] of HUMAN_BY_COUNTRY) {
    await run(`human:${country}/${lang}`, humanCountryQuery(country, lang), true);
  }

  console.log('Latin name items (given/family) per language…');
  for (const lang of LATIN_LANGS) {
    await run(`given:${lang}`, givenQuery(lang), false);
    // Family-name items (Q101352) only resolve cheaply for major Latin labels;
    // a native-language family scan times out. Native family names instead come
    // from the country-constrained human harvest above.
    await run(`family:${lang}`, familyQuery(lang), false);
  }

  console.log('Romanized people (Q5) by language…');
  for (const lang of HUMAN_LATIN_LANGS) await run(`human:${lang}`, humanLatinQuery(lang), true);

  if (total() === 0) {
    console.error('No names ingested (network/endpoint issue). Aborting without writing.');
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(here, 'data');
  mkdirSync(dataDir, { recursive: true });

  for (const [script, set] of [...buckets.entries()].sort()) {
    const names = [...set].sort();
    const file = join(dataDir, `${script.toLowerCase()}.json`);
    writeFileSync(
      file,
      JSON.stringify({ source: 'wikidata', license: LICENSE, script, names }, null, 0) + '\n'
    );
    console.log(`  ${script}: ${names.length} names → ${file}`);
  }
  console.log(`Done. ${total()} names across ${buckets.size} script(s).`);
}

void main();
