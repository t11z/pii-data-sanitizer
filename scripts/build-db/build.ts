/**
 * Builds Bloom-filter name packs for the browser from the single source of truth
 * (scripts/build-db/sources.ts). Output: public/packs/<name>.bin + packs.json.
 *
 * Partitioning is by SCRIPT, not culture: one merged `latin` pack (frequency-
 * sharded into core + ext) plus one pack per native script. The Latin core ships
 * eagerly; the long tail and native scripts load on demand at runtime.
 *
 * The source is currently a curated starter set. As permissively licensed data
 * (Wikidata CC0, open census/SSA, ...) is ingested, append it to sources.ts —
 * keep this build offline and deterministic; record source + license per pack.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BloomFilter } from '../../src/core/db/bloom';
import { PACK_FP } from '../../src/core/db/packSource';
import { SOURCES } from './sources';
import type { Script } from '../../src/core/types';

// Names beyond this rank (by source order) move into the Latin `ext` shard. With
// real frequency-ranked data this keeps the eagerly-loaded core small.
const LATIN_CORE_LIMIT = 80000;

interface PackInput {
  name: string;
  script: Script;
  tier: 'core' | 'ext';
  license: string;
  names: string[];
}

function dedupeLower(words: string[]): string[] {
  return [...new Set(words.map((w) => w.toLowerCase()))];
}

function buildInputs(): PackInput[] {
  const inputs: PackInput[] = [];
  for (const src of SOURCES) {
    const names = dedupeLower(src.names);
    if (src.script === 'Latin') {
      const core = names.slice(0, LATIN_CORE_LIMIT);
      const ext = names.slice(LATIN_CORE_LIMIT);
      inputs.push({
        name: 'latin-core',
        script: 'Latin',
        tier: 'core',
        license: src.license,
        names: core,
      });
      if (ext.length > 0) {
        inputs.push({
          name: 'latin-ext',
          script: 'Latin',
          tier: 'ext',
          license: src.license,
          names: ext,
        });
      }
    } else {
      inputs.push({
        name: src.script.toLowerCase(),
        script: src.script,
        tier: src.tier,
        license: src.license,
        names,
      });
    }
  }
  return inputs;
}

function buildFilter(names: string[]): Uint8Array {
  const bf = BloomFilter.forItems(names.length, PACK_FP);
  for (const n of names) bf.add(n);
  return bf.serialize();
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'public', 'packs');
mkdirSync(outDir, { recursive: true });

interface ManifestEntry {
  name: string;
  file: string;
  script: Script;
  tier: 'core' | 'ext';
  license: string;
  count: number;
  bytes: number;
}

const packs: ManifestEntry[] = [];

for (const input of buildInputs()) {
  if (input.names.length === 0) continue;
  const bytes = buildFilter(input.names);
  const file = `${input.name}.bin`;
  writeFileSync(join(outDir, file), bytes);
  packs.push({
    name: input.name,
    file,
    script: input.script,
    tier: input.tier,
    license: input.license,
    count: input.names.length,
    bytes: bytes.length,
  });
  console.log(`  ${input.name}: ${input.names.length} names (${bytes.length} B)`);
}

const manifest = { generated: new Date().toISOString(), packs };
writeFileSync(join(outDir, 'packs.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${packs.length} pack(s) into ${outDir}`);
