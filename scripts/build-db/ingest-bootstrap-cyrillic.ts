/**
 * Bootstrap the Cyrillic name pack. All data: Wikidata CC0.
 *
 * Rationale: Cyrillic (~250M speakers across Russia, Ukraine, Belarus, the
 * Balkans, and Central Asia) was the largest world script entirely absent from
 * the name database — no Cyrillic-script names were in any pack. Cyrillic is
 * bicameral, so at runtime its names detect through the same capitalization-
 * gated path as Latin (see isBicameralNameScript in src/core/detectors/names.ts);
 * a bare lowercase Cyrillic word that collides with a name does NOT detect.
 *
 * Country-constrained LIMIT-5000 P27 queries are the reliable lever on the
 * public endpoint — a generic native-label scan times out. Each country is
 * paired with the native Cyrillic label language(s) spoken there; the harvested
 * full-name labels are split into given + family tokens. Romanized (English)
 * forms are already covered by the generic Latin sweep in ingest.ts and are not
 * duplicated here.
 *
 * Run with: `npx tsx scripts/build-db/ingest-bootstrap-cyrillic.ts`
 * Then: `npm run build:db` and verify the net-new count via packs.json.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectScript } from '../../src/core/tokenize.js';
import { isNonNameWord } from '../../src/core/context/roleWords.js';
import type { Script } from '../../src/core/types.js';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'pii-data-sanitizer/0.1 (https://github.com/t11z/pii-data-sanitizer)';
const LICENSE = 'Wikidata (CC0)';
const TOKEN_RE = /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u;
const PAREN_RE = /\s*\([^)]*\)\s*/g;

const CAP = 20000; // matches the other native-script packs
const MIN_LEN = 2;

// [countryQID, native-Cyrillic label language]. Country constrains the human set
// so the query stays cheap; the label language picks the native Cyrillic form.
const HUMAN_BY_COUNTRY: Array<[string, string, string]> = [
  ['wd:Q159', 'ru', 'Russia'],
  ['wd:Q212', 'uk', 'Ukraine'],
  ['wd:Q212', 'ru', 'Ukraine (Russian-language labels)'],
  ['wd:Q184', 'be', 'Belarus'],
  ['wd:Q184', 'ru', 'Belarus (Russian-language labels)'],
  ['wd:Q219', 'bg', 'Bulgaria'],
  ['wd:Q403', 'sr', 'Serbia'],
  ['wd:Q221', 'mk', 'North Macedonia'],
  ['wd:Q232', 'kk', 'Kazakhstan'],
  ['wd:Q232', 'ru', 'Kazakhstan (Russian-language labels)'],
  ['wd:Q813', 'ky', 'Kyrgyzstan'],
  ['wd:Q863', 'tg', 'Tajikistan'],
  ['wd:Q711', 'mn', 'Mongolia'],
  ['wd:Q236', 'sr', 'Montenegro'],
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchQuery(sparql: string): Promise<string[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(4000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        console.warn(`  HTTP ${res.status}`);
        return [];
      }
      const text = await res.text();
      let json: { results: { bindings: Array<{ label: { value: string } }> } };
      try {
        json = JSON.parse(text);
      } catch {
        console.warn(`  JSON parse error (attempt ${attempt + 1})`);
        if (attempt < 2) {
          await sleep(3000);
          continue;
        }
        return [];
      }
      return json.results.bindings.map((b) => b.label.value);
    } catch (e) {
      if (attempt < 2) {
        await sleep(3000);
        continue;
      }
      console.warn(`  ${(e as Error).message}`);
      return [];
    } finally {
      clearTimeout(t);
    }
  }
  return [];
}

const bucket = new Set<string>();

function add(labels: string[]): void {
  for (const raw of labels) {
    const cleaned = raw.replace(PAREN_RE, ' ').trim();
    for (const part of cleaned.split(/\s+/)) {
      const name = part.trim().toLowerCase();
      if (name.length < MIN_LEN || !TOKEN_RE.test(name)) continue;
      if (detectScript(name) !== ('Cyrillic' as Script)) continue;
      if (!isNonNameWord(name) && bucket.size < CAP) bucket.add(name);
    }
  }
}

const humanQ = (country: string, lang: string): string => `SELECT ?label WHERE {
  ?p wdt:P27 ${country} .
  ?p rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT 5000`;

async function run(label: string, sparql: string): Promise<void> {
  const before = bucket.size;
  add(await fetchQuery(sparql));
  console.log(`  ${label.padEnd(46)} +${bucket.size - before}  (total ${bucket.size})`);
  await sleep(500);
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(here, 'data');

  console.log('=== Cyrillic (native labels) by country + language ===');
  for (const [country, lang, name] of HUMAN_BY_COUNTRY) {
    await run(`human:${country}/${lang} ${name}`, humanQ(country, lang));
  }

  if (bucket.size === 0) {
    console.error('No Cyrillic names ingested (network/endpoint issue). Aborting without writing.');
    process.exit(1);
  }

  const names = [...bucket].sort();
  const file = join(dataDir, 'cyrillic.json');
  writeFileSync(
    file,
    JSON.stringify({ source: 'wikidata', license: LICENSE, script: 'Cyrillic', names }, null, 0) +
      '\n'
  );
  console.log(`\nDone. ${names.length} Cyrillic names → ${file}`);
}

void main();
