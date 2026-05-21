import { SOURCES } from '../../../scripts/build-db/sources';
import { PackNameSource } from './packSource';

/**
 * Builds an in-memory PackNameSource from the committed source lists. Used by
 * tests and the benchmark so they exercise the same data the production packs
 * are built from — without any network access. NOT used by the app (the app
 * loads real packs via PackLoader).
 */
export function nameSourceFromSources(): PackNameSource {
  const source = new PackNameSource();
  for (const src of SOURCES) {
    source.addWords(src.names, { script: src.script, tier: src.tier }, src.script + '-' + src.tier);
  }
  return source;
}
