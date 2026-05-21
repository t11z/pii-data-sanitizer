/**
 * Ingests names from Wikidata (CC0) into committed data files under
 * scripts/build-db/data/<script>.json. The build (build.ts) merges these with
 * the curated sources to produce the runtime packs. Run with: `npm run ingest`.
 *
 * Network is used here only (and only at maintainer/CI build time) — never in
 * the browser. Wikidata is CC0, so the result is safe to commit. Labels are
 * bucketed by their script, lowercased, deduped, and limited to single-token
 * (optionally hyphenated/apostrophe) names so they can match individual tokens.
 *
 * This is intentionally a bounded sample (not the full ~1M names) to keep the
 * repo reasonable; the self-improvement loop grows it over time.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectScript } from '../../src/core/tokenize';
import type { Script } from '../../src/core/types';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'pii-data-sanitizer/0.1 (https://github.com/t11z/pii-data-sanitizer)';
const LICENSE = 'Wikidata (CC0)';

// Label languages to harvest. Latin-script langs yield European + transliterated
// names; ar/he/hi yield native scripts. CJK labels are Han/Kana and get dropped
// (out of scope) — Pinyin/Romaji coverage comes from the curated sources.
const LANGS = [
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
  'ar',
  'he',
  'hi',
  'fa',
];

const GIVEN_CLASSES = ['wd:Q202444', 'wd:Q12308941', 'wd:Q11879590', 'wd:Q3409032'];
const FAMILY_CLASS = 'wd:Q101352';

// Per-script caps to keep the committed data bounded.
const CAPS: Record<string, number> = {
  Latin: 12000,
  Arabic: 4000,
  Hebrew: 4000,
  Devanagari: 4000,
};

const TOKEN_RE = /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u;
const langFilter = LANGS.map((l) => `"${l}"`).join(', ');

async function query(sparql: string): Promise<string[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`  query failed: HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as {
      results: { bindings: Array<{ label: { value: string } }> };
    };
    return json.results.bindings.map((b) => b.label.value);
  } catch (err) {
    console.warn(`  query error: ${(err as Error).message}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function givenQuery(limit: number): string {
  return `SELECT ?label WHERE {
    ?n wdt:P31 ?c . VALUES ?c { ${GIVEN_CLASSES.join(' ')} }
    ?n rdfs:label ?label . FILTER(LANG(?label) IN (${langFilter}))
  } LIMIT ${limit}`;
}

function familyQuery(limit: number): string {
  return `SELECT ?label WHERE {
    ?n wdt:P31 ${FAMILY_CLASS} .
    ?n rdfs:label ?label . FILTER(LANG(?label) IN (${langFilter}))
  } LIMIT ${limit}`;
}

function bucket(labels: string[], buckets: Map<Script, Set<string>>): void {
  for (const raw of labels) {
    const name = raw.trim().toLowerCase();
    if (name.length < 2 || !TOKEN_RE.test(name)) continue;
    const script = detectScript(name);
    if (script === 'Han' || script === 'Other') continue;
    if (!CAPS[script]) continue;
    let set = buckets.get(script);
    if (!set) {
      set = new Set();
      buckets.set(script, set);
    }
    if (set.size < CAPS[script]) set.add(name);
  }
}

async function main(): Promise<void> {
  const buckets = new Map<Script, Set<string>>();

  console.log('Fetching given names from Wikidata…');
  bucket(await query(givenQuery(20000)), buckets);
  console.log('Fetching family names from Wikidata…');
  bucket(await query(familyQuery(15000)), buckets);

  const total = [...buckets.values()].reduce((n, s) => n + s.size, 0);
  if (total === 0) {
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
  console.log(`Done. ${total} names across ${buckets.size} script(s).`);
}

void main();
