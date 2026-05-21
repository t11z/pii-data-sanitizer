/**
 * Builds Bloom-filter name packs for the browser.
 *
 * v1 uses the embedded multilingual seed lists as the single source. As
 * permissively licensed, language-specific datasets are added (see
 * docs/self-improve.md and the licensing note below), append them to SOURCES —
 * one entry per language/script. Output: public/packs/<lang>-{given,family}.bin
 * plus a packs.json manifest.
 *
 * Licensing: only ingest name data under a permissive/public-domain license
 * (e.g. CC0). Record the source + license for every pack you add.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BloomFilter } from '../../src/core/db/bloom';
import { GIVEN_NAMES, FAMILY_NAMES } from '../../src/core/db/embeddedData';

interface SourceList {
  lang: string;
  license: string;
  given: string[];
  family: string[];
}

const SOURCES: SourceList[] = [
  {
    lang: 'seed',
    license: 'project-curated',
    given: GIVEN_NAMES,
    family: FAMILY_NAMES,
  },
];

function dedupeLower(words: string[]): string[] {
  return [...new Set(words.map((w) => w.toLowerCase()))];
}

function buildFilter(words: string[]): BloomFilter {
  const bf = BloomFilter.forItems(words.length, 0.01);
  words.forEach((w) => bf.add(w));
  return bf;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'public', 'packs');
mkdirSync(outDir, { recursive: true });

interface PackEntry {
  lang: string;
  license: string;
  given: string;
  family: string;
  counts: { given: number; family: number };
  bytes: { given: number; family: number };
}

const packs: PackEntry[] = [];

for (const src of SOURCES) {
  const given = dedupeLower(src.given);
  const family = dedupeLower(src.family);
  const givenBytes = buildFilter(given).serialize();
  const familyBytes = buildFilter(family).serialize();
  const givenFile = `${src.lang}-given.bin`;
  const familyFile = `${src.lang}-family.bin`;
  writeFileSync(join(outDir, givenFile), givenBytes);
  writeFileSync(join(outDir, familyFile), familyBytes);
  packs.push({
    lang: src.lang,
    license: src.license,
    given: givenFile,
    family: familyFile,
    counts: { given: given.length, family: family.length },
    bytes: { given: givenBytes.length, family: familyBytes.length },
  });
  console.log(
    `  ${src.lang}: ${given.length} given (${givenBytes.length} B), ${family.length} family (${familyBytes.length} B)`
  );
}

const manifest = { generated: new Date().toISOString(), packs };
writeFileSync(join(outDir, 'packs.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${packs.length} pack(s) into ${outDir}`);
