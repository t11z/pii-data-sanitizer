/**
 * Bootstrap Bengali and Tamil name packs from Wikidata country-constrained
 * queries. Runs independently of the full `npm run ingest` so new scripts can
 * be seeded quickly on the public Wikidata endpoint (large generic queries time
 * out; country-constrained LIMIT-5000 queries are reliable).
 *
 * Data: Wikidata CC0. Run with: `npx tsx scripts/build-db/ingest-bootstrap.ts`
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
const TOKEN_RE = /^[\p{L}\p{M}]+(?:[-''][\p{L}\p{M}]+)*$/u;
const PAREN_RE = /\s*\([^)]*\)\s*/g;
const CAPS: Record<string, number> = { Bengali: 20000, Tamil: 20000 };
const MIN_LEN = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchQuery(sparql: string): Promise<string[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 50000);
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
      // Read as text first to handle malformed JSON from the endpoint gracefully.
      const text = await res.text();
      let json: { results: { bindings: Array<{ label: { value: string } }> } };
      try {
        json = JSON.parse(text);
      } catch {
        console.warn(`  JSON parse error (attempt ${attempt + 1})`);
        if (attempt < 2) { await sleep(3000); continue; }
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

const buckets = new Map<Script, Set<string>>();

function add(labels: string[], script: Script, split: boolean): void {
  const cap = CAPS[script];
  if (!cap) return;
  let bucket = buckets.get(script);
  if (!bucket) {
    bucket = new Set();
    buckets.set(script, bucket);
  }
  for (const raw of labels) {
    const cleaned = raw.replace(PAREN_RE, ' ').trim();
    const parts = split ? cleaned.split(/\s+/) : [cleaned];
    for (const part of parts) {
      const name = part.trim().toLowerCase();
      if (name.length < MIN_LEN || !TOKEN_RE.test(name)) continue;
      const detected = detectScript(name);
      if (detected !== script) continue;
      if (!isNonNameWord(name) && bucket.size < cap) bucket.add(name);
    }
  }
}

async function run(label: string, sparql: string, script: Script, split: boolean): Promise<void> {
  const before = buckets.get(script)?.size ?? 0;
  const labels = await fetchQuery(sparql);
  add(labels, script, split);
  const after = buckets.get(script)?.size ?? 0;
  console.log(`  ${label.padEnd(34)} +${after - before}  (total ${after})`);
  await sleep(400);
}

const humanQ = (country: string, lang: string): string => `SELECT ?label WHERE {
  ?p wdt:P27 ${country} .
  ?p rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT 5000`;


async function main(): Promise<void> {
  // Country-constrained human queries (LIMIT 5000) are the reliable lever on
  // the public Wikidata endpoint — generic name-item queries time out.
  console.log('=== Bengali (bn) ===');
  await run('human:Q902/bn Bangladesh', humanQ('wd:Q902', 'bn'), 'Bengali', true);
  await run('human:Q668/bn India',      humanQ('wd:Q668', 'bn'), 'Bengali', true);

  console.log('\n=== Tamil (ta) ===');
  await run('human:Q668/ta India',      humanQ('wd:Q668', 'ta'), 'Tamil', true);
  await run('human:Q854/ta Sri Lanka',  humanQ('wd:Q854', 'ta'), 'Tamil', true);

  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(here, 'data');

  let total = 0;
  console.log('\n=== Output ===');
  for (const [script, set] of [...buckets.entries()].sort()) {
    const names = [...set].sort();
    total += names.length;
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
