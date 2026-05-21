import { describe, it, expect } from 'vitest';
import { BloomFilter } from './bloom';
import { PackNameSource } from './packSource';

describe('PackNameSource', () => {
  it('returns no hits when empty', () => {
    const source = new PackNameSource();
    expect(source.has('müller')).toBe(false);
    expect(source.packCount).toBe(0);
  });

  it('unions membership across packs', () => {
    const source = new PackNameSource();
    source.addWords(['müller', 'schmidt'], { script: 'Latin', tier: 'core' }, 'latin-core');
    source.addWords(['محمد', 'حسن'], { script: 'Arabic', tier: 'core' }, 'arabic');
    expect(source.has('müller')).toBe(true);
    expect(source.has('محمد')).toBe(true);
    expect(source.has('unknown')).toBe(false);
    expect(source.packCount).toBe(2);
  });

  it('tracks loaded pack ids', () => {
    const source = new PackNameSource();
    expect(source.isLoaded('latin-core')).toBe(false);
    const bf = BloomFilter.forItems(2, 0.01);
    bf.add('anna');
    source.addBloom(bf, { script: 'Latin', tier: 'core' }, 'latin-core');
    expect(source.isLoaded('latin-core')).toBe(true);
    expect(source.has('anna')).toBe(true);
  });
});
