/**
 * Bootstrap the Thai name pack from Wikidata country-constrained queries. Thai
 * (Thailand's national script, ~70M speakers) was previously entirely absent
 * from the name database — no Thai-script names in any pack. Runs independently
 * of the full `npm run ingest` so the new script can be seeded quickly on the
 * public Wikidata endpoint (large generic queries time out; country-constrained
 * LIMIT-5000 queries are reliable).
 *
 * Thai is caseless (unicameral), so native labels match purely by dictionary
 * membership (see isCaselessNameScript in names.ts). Two files are written and
 * neither clobbers an existing pack:
 *   - data/thai.json        — native Thai-script tokens (Thai pack)
 *   - data/thai-latin.json  — romanized (English-label) forms (merged into the
 *                             Latin pack by build.ts, which concatenates every
 *                             data file of the same script)
 *
 * Data: Wikidata CC0. Run with: `npx tsx scripts/build-db/ingest-bootstrap-thai.ts`
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
const CAPS: Record<string, number> = { Thai: 20000, Latin: 20000 };

// English Wikidata labels of Thai people are dominated by royalty and public
// figures whose labels carry honorifics, articles, and venue/org words rather
// than a bare given+family pair ("Prince ...", "The ...", "... Cafe"). Those
// tokens are common words, not names — left in the Latin pack they chain into
// adjacent capitalized words and produce false positives (e.g. "Café Rouge").
// isNonNameWord already drops the structural-noun class; this covers the
// title/article/venue gap it does not. Native Thai tokens are unaffected.
const ROMANIZED_STOPWORDS = new Set<string>([
  'the',
  'of',
  'and',
  'de',
  'la',
  'na',
  'von',
  'van',
  'saint',
  'san',
  'sir',
  'lord',
  'lady',
  'prince',
  'princess',
  'king',
  'queen',
  'royal',
  'phra',
  'luang',
  'khun',
  'nai',
  'cafe',
  'hotel',
  'club',
  'temple',
  'city',
  'school',
  'university',
  'international',
  'national',
  'company',
  'limited',
]);
// Native Thai tokens keep a length-2 floor; romanized Latin variants shorter
// than 3 collide with ordinary words, so the Latin bucket uses a higher floor.
const MIN_LEN_NATIVE = 2;
const MIN_LEN_LATIN = 3;

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

function add(labels: string[], script: Script, split: boolean): void {
  const cap = CAPS[script];
  if (!cap) return;
  const minLen = script === 'Latin' ? MIN_LEN_LATIN : MIN_LEN_NATIVE;
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
      if (name.length < minLen || !TOKEN_RE.test(name)) continue;
      if (detectScript(name) !== script) continue;
      if (script === 'Latin' && ROMANIZED_STOPWORDS.has(name)) continue;
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

// Country-constrained human query (LIMIT 5000) is the reliable lever on the
// public Wikidata endpoint — generic name-item queries time out.
const humanQ = (country: string, lang: string): string => `SELECT ?label WHERE {
  ?p wdt:P27 ${country} .
  ?p rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT 5000`;

// Dedicated given/family name items carrying a Thai label — complements the
// human harvest with clean single-token names.
const nameItemQ = (lang: string): string => `SELECT ?label WHERE {
  ?n wdt:P31 ?c . VALUES ?c { wd:Q202444 wd:Q101352 wd:Q12308941 wd:Q11879590 }
  ?n rdfs:label ?label . FILTER(LANG(?label)="${lang}")
} LIMIT 5000`;

async function main(): Promise<void> {
  console.log('=== Thai (th) — native script ===');
  await run('human:Q869/th Thailand', humanQ('wd:Q869', 'th'), 'Thai', true);
  await run('name-items:th', nameItemQ('th'), 'Thai', false);

  console.log('\n=== Thai — romanized (en labels) → Latin pack ===');
  await run('human:Q869/en Thailand', humanQ('wd:Q869', 'en'), 'Latin', true);

  const here = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(here, 'data');

  // Explicit filenames so the Latin romanizations land in their own file rather
  // than overwriting the shared latin.json.
  const outFiles: Record<string, string> = { Thai: 'thai.json', Latin: 'thai-latin.json' };

  let total = 0;
  console.log('\n=== Output ===');
  for (const [script, set] of [...buckets.entries()].sort()) {
    const names = [...set].sort();
    total += names.length;
    const file = join(dataDir, outFiles[script]);
    writeFileSync(
      file,
      JSON.stringify({ source: 'wikidata', license: LICENSE, script, names }, null, 0) + '\n'
    );
    console.log(`  ${script}: ${names.length} names → ${file}`);
  }
  console.log(`Done. ${total} names across ${buckets.size} script(s).`);
}

void main();
