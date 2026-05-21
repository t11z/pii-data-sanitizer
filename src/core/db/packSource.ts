import type { NameSource, Script, Tier } from '../types';
import { BloomFilter } from './bloom';

export type { Tier } from '../types';

/** Target false-positive rate for name packs. Low enough that cross-token
 * chain mis-extensions are rare; cheap in bytes at our pack sizes. */
export const PACK_FP = 1e-4;

export interface PackMeta {
  script: Script;
  tier: Tier;
}

/**
 * NameSource backed by one or more Bloom-filter packs. Membership is the union
 * across all registered packs, queried directly on each pack's `Uint8Array`
 * (no JS Set is ever materialized, so memory stays flat regardless of how many
 * names are loaded). Packs are added lazily by the loader as scripts appear in
 * the input. Given/family are not distinguished — the current scoring only uses
 * combined membership (`anyHit` in detectors/names.ts).
 */
export class PackNameSource implements NameSource {
  private packs: Array<{ filter: BloomFilter; meta: PackMeta }> = [];
  private loaded = new Set<string>();

  get packCount(): number {
    return this.packs.length;
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  addBloom(filter: BloomFilter, meta: PackMeta, id?: string): void {
    this.packs.push({ filter, meta });
    if (id) this.loaded.add(id);
  }

  /**
   * Builds a Bloom pack from a word list in memory (tests / fixtures). Uses the
   * same target false-positive rate as the build pipeline (PACK_FP) so an
   * in-memory fixture behaves identically to a fetched production pack.
   */
  addWords(words: string[], meta: PackMeta, id?: string): void {
    const cleaned = [...new Set(words.map((w) => w.toLowerCase()))];
    const filter = BloomFilter.forItems(cleaned.length, PACK_FP);
    for (const w of cleaned) filter.add(w);
    this.addBloom(filter, meta, id);
  }

  private hit(name: string, script?: Script): boolean {
    for (const { filter, meta } of this.packs) {
      if (script && meta.script !== script) continue;
      if (filter.has(name)) return true;
    }
    return false;
  }

  hasGiven(name: string, script?: Script): boolean {
    return this.hit(name, script);
  }

  hasFamily(name: string, script?: Script): boolean {
    return this.hit(name, script);
  }

  has(name: string, script?: Script): boolean {
    return this.hit(name, script);
  }

  matchTier(name: string, script?: Script): Tier | null {
    let ext = false;
    for (const { filter, meta } of this.packs) {
      if (script && meta.script !== script) continue;
      if (filter.has(name)) {
        if (meta.tier === 'core') return 'core';
        ext = true;
      }
    }
    return ext ? 'ext' : null;
  }
}
