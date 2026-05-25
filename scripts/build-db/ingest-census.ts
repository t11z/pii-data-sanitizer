/**
 * Ingests US Census 2010 surnames (public domain) into
 * scripts/build-db/data/latin-census.json. The build (build.ts) merges every
 * data/*.json of the same script, so these surnames join the Wikidata Latin
 * names in the latin-ext pack. Run with: `npm run ingest:census`.
 *
 * Network + `unzip` are used here only at maintainer/CI build time — never in
 * the browser. The Census Bureau publishes this list as public-domain data, so
 * the result is safe to commit. Names are lowercased, validated as single
 * tokens, and capped (top-N by frequency rank) to keep the Bloom pack bounded.
 */
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { isNonNameWord } from '../../src/core/context/roleWords';

const URL = 'https://www2.census.gov/topics/genealogy/2010surnames/names.zip';
const USER_AGENT = 'pii-data-sanitizer/0.1 (https://github.com/t11z/pii-data-sanitizer)';
const LICENSE = 'US Census 2010 surnames (public domain)';
const CAP = 50000;
const TOKEN_RE = /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u;

async function main(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'census-'));
  const zipPath = join(tmp, 'names.zip');
  try {
    console.log(`Downloading ${URL} …`);
    const res = await fetch(URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      console.error(`Download failed: HTTP ${res.status}. Aborting without writing.`);
      process.exit(1);
    }
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

    // Extract the CSV to stdout (filename inside the zip is Names_2010Census.csv).
    const csv = execFileSync('unzip', ['-p', zipPath, '*.csv'], {
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
    });

    const names: string[] = [];
    const seen = new Set<string>();
    const lines = csv.split(/\r?\n/);
    for (const line of lines.slice(1)) {
      // Rows are sorted by rank; the first column is the surname.
      const field = line.split(',')[0]?.trim().toLowerCase();
      if (!field || field.length < 2 || !TOKEN_RE.test(field)) continue; // skips "all other names"
      // Drop surnames the engine treats as structural non-name words (e.g.
      // "service", "team") so phrases like "Customer Service Team" don't detect.
      if (isNonNameWord(field)) continue;
      if (seen.has(field)) continue;
      seen.add(field);
      names.push(field);
      if (names.length >= CAP) break;
    }

    if (names.length === 0) {
      console.error('No surnames parsed. Aborting without writing.');
      process.exit(1);
    }

    const here = dirname(fileURLToPath(import.meta.url));
    const dataDir = join(here, 'data');
    mkdirSync(dataDir, { recursive: true });
    const file = join(dataDir, 'latin-census.json');
    names.sort();
    writeFileSync(
      file,
      JSON.stringify({ source: 'us-census-2010', license: LICENSE, script: 'Latin', names }, null, 0) +
        '\n'
    );
    console.log(`  Latin (census): ${names.length} surnames → ${file}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

void main();
