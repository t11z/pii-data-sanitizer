/**
 * Builds Bloom-filter name packs for the browser. Output: public/packs/<name>.bin
 * + packs.json. Sources merged:
 *   - curated common names      → scripts/build-db/sources.ts  (Latin = core tier)
 *   - ingested Wikidata bulk     → scripts/build-db/data/*.json (Latin = ext tier)
 *
 * Partitioning is by SCRIPT, not culture: a merged Latin pack (core curated +
 * ext bulk) plus one pack per native script. Latin core ships eagerly; the long
 * tail (ext) and native scripts load on demand at runtime. Build is offline and
 * deterministic — run `npm run ingest` to refresh the committed data files.
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BloomFilter } from '../../src/core/db/bloom';
import { PACK_FP } from '../../src/core/db/packSource';
import { SOURCES } from './sources';
import type { Script } from '../../src/core/types';

interface PackInput {
  name: string;
  script: Script;
  tier: 'core' | 'ext';
  license: string;
  names: string[];
}

const here = dirname(fileURLToPath(import.meta.url));

function dedupeLower(words: string[]): string[] {
  return [...new Set(words.map((w) => w.toLowerCase()))];
}

/**
 * Loads ingested data files (scripts/build-db/data/*.json) by script. Multiple
 * files may target the same script (e.g. Wikidata + US Census, both Latin);
 * their names are concatenated and their licenses combined.
 */
function readIngested(): { byScript: Map<Script, string[]>; license: string } {
  const byScript = new Map<Script, string[]>();
  const licenses = new Set<string>();
  const dataDir = join(here, 'data');
  if (!existsSync(dataDir)) return { byScript, license: '' };
  for (const file of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(dataDir, file), 'utf8')) as {
      script: Script;
      license: string;
      names: string[];
    };
    const existing = byScript.get(parsed.script);
    if (existing) existing.push(...parsed.names);
    else byScript.set(parsed.script, [...parsed.names]);
    if (parsed.license) licenses.add(parsed.license);
  }
  return { byScript, license: [...licenses].join('; ') };
}

function buildInputs(): PackInput[] {
  const curated = new Map<Script, { license: string; names: string[] }>();
  for (const src of SOURCES) curated.set(src.script, { license: src.license, names: src.names });

  const ingested = readIngested();
  const scripts = new Set<Script>([...curated.keys(), ...ingested.byScript.keys()]);
  const inputs: PackInput[] = [];

  for (const script of scripts) {
    const core = dedupeLower(curated.get(script)?.names ?? []);
    const coreSet = new Set(core);
    const ext = dedupeLower(ingested.byScript.get(script) ?? []).filter((n) => !coreSet.has(n));
    const license = curated.get(script)?.license ?? ingested.license;

    if (script === 'Latin') {
      inputs.push({ name: 'latin-core', script, tier: 'core', license, names: core });
      if (ext.length > 0) {
        inputs.push({
          name: 'latin-ext',
          script,
          tier: 'ext',
          license: ingested.license || license,
          names: ext,
        });
      }
    } else {
      // Native scripts: one pack (curated + ingested), loaded on demand by script.
      inputs.push({
        name: script.toLowerCase(),
        script,
        tier: 'core',
        license: ingested.byScript.has(script) ? `${license}; ${ingested.license}` : license,
        names: [...new Set([...core, ...ext])],
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
