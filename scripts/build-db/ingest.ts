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
import type { Script } from '../../src/core/types';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'pii-data-sanitizer/0.1 (https://github.com/t11z/pii-data-sanitizer)';
const LICENSE = 'Wikidata (CC0)';

// Name-item label languages, grouped by the script they predominantly yield.
const LATIN_LANGS = [
  'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'sv', 'da',
  'nb', 'fi', 'cs', 'ro', 'hu', 'tr', 'id', 'ca',
];
const ARABIC_LANGS = ['ar', 'fa', 'ur', 'ps', 'ckb', 'sd'];
const HEBREW_LANGS = ['he', 'yi'];
const DEVANAGARI_LANGS = ['hi', 'mr', 'ne', 'sa'];

const NATIVE_LANGS = [...ARABIC_LANGS, ...HEBREW_LANGS, ...DEVANAGARI_LANGS];
const ALL_LANGS = [...LATIN_LANGS, ...NATIVE_LANGS];

// Humans (Q5) by major Latin label language — fast, large romanized-name pool.
const HUMAN_LATIN_LANGS = ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl'];

// Regional humans by [countryQID, labelLang]. Country constrains the set so the
// query is cheap; the label language picks native script or romanized (en).
const HUMAN_BY_COUNTRY: Array<[string, string]> = [
  ['wd:Q668', 'hi'], ['wd:Q668', 'mr'], ['wd:Q668', 'sa'], ['wd:Q668', 'en'], // India
  ['wd:Q837', 'ne'], ['wd:Q837', 'en'], // Nepal
  ['wd:Q794', 'fa'], ['wd:Q794', 'en'], // Iran
  ['wd:Q843', 'ur'], ['wd:Q843', 'en'], // Pakistan
  ['wd:Q889', 'ps'], ['wd:Q889', 'fa'], ['wd:Q889', 'en'], // Afghanistan
  ['wd:Q79', 'ar'], ['wd:Q79', 'en'], // Egypt
  ['wd:Q851', 'ar'], // Saudi Arabia
  ['wd:Q796', 'ar'], // Iraq
  ['wd:Q822', 'ar'], // Lebanon
  ['wd:Q878', 'ar'], // United Arab Emirates
  ['wd:Q801', 'he'], ['wd:Q801', 'en'], // Israel
];

const GIVEN_CLASSES = ['wd:Q202444', 'wd:Q12308941', 'wd:Q11879590', 'wd:Q3409032'];
const FAMILY_CLASS = 'wd:Q101352';

// Per-script caps to keep the committed data bounded.
const CAPS: Record<string, number> = {
  Latin: 60000,
  Arabic: 20000,
  Hebrew: 10000,
  Devanagari: 20000,
};

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

/**
 * Adds harvested labels to the script buckets. `split` tokenizes multi-word
 * labels on whitespace (for human/full-name labels); name-item labels are
 * single tokens and only need parenthetical disambiguation stripped.
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
      let set = buckets.get(script);
      if (!set) {
        set = new Set();
        buckets.set(script, set);
      }
      if (set.size < CAPS[script]) set.add(name);
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
  console.log('Name items (given/family) per language…');
  for (const lang of ALL_LANGS) {
    await run(`given:${lang}`, givenQuery(lang), false);
    // Family-name items (Q101352) only resolve cheaply for major Latin labels;
    // a native-language family scan times out. Native family names instead come
    // from the country-constrained human harvest below.
    if (LATIN_LANGS.includes(lang)) await run(`family:${lang}`, familyQuery(lang), false);
  }
  console.log('Alt-labels for native scripts…');
  for (const lang of NATIVE_LANGS) await run(`alt:${lang}`, altLabelQuery(lang), true);

  console.log('Romanized people (Q5) by language…');
  for (const lang of HUMAN_LATIN_LANGS) await run(`human:${lang}`, humanLatinQuery(lang), true);

  console.log('Regional people by country + language…');
  for (const [country, lang] of HUMAN_BY_COUNTRY) {
    await run(`human:${country}/${lang}`, humanCountryQuery(country, lang), true);
  }

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
