import type { Script } from '../types';
import { BloomFilter } from './bloom';
import { PackNameSource, type Tier } from './packSource';

export interface PackManifestEntry {
  name: string;
  file: string;
  script: Script;
  tier: Tier;
  count: number;
  bytes: number;
}

export interface PackManifest {
  generated: string;
  packs: PackManifestEntry[];
}

const CACHE_NAME = 'pii-name-packs-v1';

async function fetchBytes(url: string): Promise<Uint8Array> {
  // Prefer the Cache API (browser/worker) so packs persist across sessions and
  // work offline after the first load. Falls back to a plain fetch otherwise.
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME);
    let res = await cache.match(url);
    if (!res) {
      res = await fetch(url);
      if (res.ok) await cache.put(url, res.clone());
    }
    return new Uint8Array(await res.arrayBuffer());
  }
  const res = await fetch(url);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Loads Bloom name packs into a PackNameSource on demand. Latin-core is loaded
 * eagerly (covers almost all input); native-script packs are loaded when their
 * script appears in the text; the Latin long tail loads in the background. All
 * fetches are same-origin GETs of static dictionaries — never uploads.
 */
export class PackLoader {
  private manifest: PackManifest | null = null;
  private inflight = new Map<string, Promise<void>>();
  private loadedNames = new Set<string>();

  constructor(
    public readonly source: PackNameSource,
    private readonly base = '/packs/'
  ) {}

  async loadManifest(): Promise<PackManifest> {
    if (!this.manifest) {
      const res = await fetch(this.base + 'packs.json');
      this.manifest = (await res.json()) as PackManifest;
    }
    return this.manifest;
  }

  private loadEntry(entry: PackManifestEntry): Promise<void> {
    if (this.loadedNames.has(entry.name)) return Promise.resolve();
    let p = this.inflight.get(entry.name);
    if (!p) {
      p = (async () => {
        const bytes = await fetchBytes(this.base + entry.file);
        this.source.addBloom(
          BloomFilter.deserialize(bytes),
          { script: entry.script, tier: entry.tier },
          entry.name
        );
        this.loadedNames.add(entry.name);
      })();
      this.inflight.set(entry.name, p);
    }
    return p;
  }

  /** Eager: Latin core (covers ~99% of inputs). */
  async loadEager(): Promise<void> {
    const m = await this.loadManifest();
    await Promise.all(
      m.packs.filter((p) => p.script === 'Latin' && p.tier === 'core').map((p) => this.loadEntry(p))
    );
  }

  /** Background: the Latin long tail. */
  async loadBackground(): Promise<void> {
    const m = await this.loadManifest();
    await Promise.all(
      m.packs.filter((p) => p.script === 'Latin' && p.tier === 'ext').map((p) => this.loadEntry(p))
    );
  }

  /** On demand: native-script packs for the scripts present in the text. */
  async loadForScripts(scripts: Iterable<Script>): Promise<boolean> {
    const m = await this.loadManifest();
    const want = new Set(scripts);
    const todo = m.packs.filter(
      (p) => p.script !== 'Latin' && want.has(p.script) && !this.loadedNames.has(p.name)
    );
    if (todo.length === 0) return false;
    await Promise.all(todo.map((p) => this.loadEntry(p)));
    return true;
  }

  get loadedCount(): number {
    return this.loadedNames.size;
  }

  get totalCount(): number {
    return this.manifest?.packs.length ?? 0;
  }

  /** Unique names across loaded packs (summed manifest counts). */
  get loadedNameCount(): number {
    if (!this.manifest) return 0;
    let n = 0;
    for (const p of this.manifest.packs) if (this.loadedNames.has(p.name)) n += p.count;
    return n;
  }

  /** Unique names across the whole dictionary (all manifest packs). */
  get totalNameCount(): number {
    if (!this.manifest) return 0;
    return this.manifest.packs.reduce((sum, p) => sum + p.count, 0);
  }
}
