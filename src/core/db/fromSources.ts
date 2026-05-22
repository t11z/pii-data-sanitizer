import { SOURCES } from '../../../scripts/build-db/sources';
import { buildInputs } from '../../../scripts/build-db/build';
import { PackNameSource } from './packSource';

/**
 * Builds an in-memory PackNameSource from the curated source lists only
 * (`scripts/build-db/sources.ts` — the Latin `core` tier). This is the SMALL,
 * deterministic subset used by unit tests; it is NOT the full production
 * dictionary. The production packs additionally fold in the ingested bulk data
 * (`scripts/build-db/data/*.json` → Latin `ext` tier), which this function omits.
 * For a production-equivalent source (e.g. the coverage probe, or verifying that
 * a name is genuinely absent from the DB) use `nameSourceFromBuildInputs()`.
 * NOT used by the app (the app loads real packs via PackLoader).
 */
export function nameSourceFromSources(): PackNameSource {
  const source = new PackNameSource();
  for (const src of SOURCES) {
    source.addWords(src.names, { script: src.script, tier: src.tier }, src.script + '-' + src.tier);
  }
  return source;
}

/**
 * Builds an in-memory PackNameSource from the FULL committed dictionary — the
 * exact inputs the production packs are compiled from (curated `core` + ingested
 * `ext`), via `buildInputs()`. Use this whenever the test/bench must mirror what
 * the shipped app actually knows: the coverage probe runs the detector over it,
 * and "is this name in the DB?" checks must query it (a curated-only check
 * reports every `ext`-tier name as falsely absent). Offline, no network access.
 * NOT used by the app (the app loads real packs via PackLoader).
 */
export function nameSourceFromBuildInputs(): PackNameSource {
  const source = new PackNameSource();
  for (const input of buildInputs()) {
    source.addWords(input.names, { script: input.script, tier: input.tier }, input.name);
  }
  return source;
}
