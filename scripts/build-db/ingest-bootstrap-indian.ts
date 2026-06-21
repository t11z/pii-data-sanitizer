/**
 * Bootstrap Telugu, Gujarati, Kannada, and Malayalam name packs, plus expand
 * Tamil coverage with Malaysia and Singapore. All data: Wikidata CC0.
 *
 * Rationale: these four Indian scripts (200M+ combined speakers) were entirely
 * absent from the name database. Country-constrained LIMIT-5000 queries are the
 * reliable lever on the public endpoint — generic label scans time out.
 *
 * Run with: `npx tsx scripts/build-db/ingest-bootstrap-indian.ts`
 * Then: `npm run build:db` and verify the net-new count via packs.json.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
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

// Per-script ingest caps; new scripts start at 20 000 matching existing native packs.
const CAPS: Record<string, number> = {
  Telugu: 20000,
  Gujarati: 20000,
  Kannada: 20000,
  Malayalam: 20000,
  Tamil: 20000,
};

const MIN_LEN = 2;

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

const buckets = new Map<Script, Set<string>>();

function add(labels: string[], expectedScript: Script): void {
  const cap = CAPS[expectedScript];
  if (!cap) return;
  let bucket = buckets.get(expectedScript);
  if (!bucket) {
    bucket = new Set();
    buckets.set(expectedScript, bucket);
  }
  for (const raw of labels) {
    const cleaned = raw.replace(PAREN_RE, ' ').trim();
    for (const part of cleaned.split(/\s+/)) {
      const name = part.trim().toLowerCase();
      if (name.length < MIN_LEN || !TOKEN_RE.test(name)) continue;
      if (detectScript(name) !== expectedScript) continue;
      if (!isNonNameWord(name) && bucket.size < cap) bucket.add(name);
    }
  }
}

async function run(label: string, sparql: string, script: Script): Promise<void> {
  const before = buckets.get(script)?.size ?? 0;
  const labels = await fetchQuery(sparql);
  add(labels, script);
  const after = buckets.get(script)?.size ?? 0;
  console.log(`  ${label.padEnd(38)} +${after - before}  (total ${after})`);
  await sleep(500);
}

const humanQ = (country: string, lang: string): string => `SELECT ?label WHERE {
  ?p wdt:P27 ${country} .
  ?p rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT 5000`;

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(here, 'data');

  console.log('=== Telugu (te) — Andhra Pradesh / Telangana, India ===');
  await run('human:Q668/te India', humanQ('wd:Q668', 'te'), 'Telugu');

  console.log('\n=== Gujarati (gu) — Gujarat, India ===');
  await run('human:Q668/gu India', humanQ('wd:Q668', 'gu'), 'Gujarati');

  console.log('\n=== Kannada (kn) — Karnataka, India ===');
  await run('human:Q668/kn India', humanQ('wd:Q668', 'kn'), 'Kannada');

  console.log('\n=== Malayalam (ml) — Kerala, India ===');
  await run('human:Q668/ml India', humanQ('wd:Q668', 'ml'), 'Malayalam');

  // Tamil expansion: merge new data on top of the committed tamil.json.
  console.log('\n=== Tamil (ta) expansion — Malaysia & Singapore ===');
  const tamilFile = join(dataDir, 'tamil.json');
  if (existsSync(tamilFile)) {
    const existing = JSON.parse(readFileSync(tamilFile, 'utf8')) as { names: string[] };
    let bucket = buckets.get('Tamil');
    if (!bucket) {
      bucket = new Set();
      buckets.set('Tamil', bucket);
    }
    for (const n of existing.names) bucket.add(n);
    console.log(`  Loaded ${bucket.size} existing Tamil names from tamil.json`);
  }
  await run('human:Q833/ta Malaysia', humanQ('wd:Q833', 'ta'), 'Tamil');
  await run('human:Q334/ta Singapore', humanQ('wd:Q334', 'ta'), 'Tamil');

  console.log('\n=== Output ===');
  let total = 0;
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
