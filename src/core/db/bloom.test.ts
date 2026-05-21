import { describe, it, expect } from 'vitest';
import { BloomFilter } from './bloom';
import { BloomNameSource } from './bloomNameSource';

describe('BloomFilter', () => {
  it('reports membership without false negatives', () => {
    const words = ['müller', 'zhang', 'priya', 'محمد', 'kai-uwe'];
    const bf = BloomFilter.forItems(words.length, 0.001);
    words.forEach((w) => bf.add(w));
    for (const w of words) expect(bf.has(w)).toBe(true);
  });

  it('keeps false positives near the configured rate', () => {
    const n = 2000;
    const bf = BloomFilter.forItems(n, 0.01);
    for (let i = 0; i < n; i++) bf.add(`member-${i}`);
    let fp = 0;
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      if (bf.has(`absent-${i}`)) fp++;
    }
    expect(fp / trials).toBeLessThan(0.03);
  });

  it('round-trips through serialization', () => {
    const bf = BloomFilter.forItems(100, 0.01);
    ['anna', 'schmidt', 'rossi'].forEach((w) => bf.add(w));
    const restored = BloomFilter.deserialize(bf.serialize());
    expect(restored.m).toBe(bf.m);
    expect(restored.k).toBe(bf.k);
    expect(restored.has('anna')).toBe(true);
    expect(restored.has('schmidt')).toBe(true);
  });
});

describe('BloomNameSource', () => {
  it('looks up across merged packs', () => {
    const given = BloomFilter.forItems(10, 0.001);
    const family = BloomFilter.forItems(10, 0.001);
    given.add('haruki');
    family.add('murakami');
    const source = new BloomNameSource();
    source.addPack(given, family);
    expect(source.hasGiven('haruki')).toBe(true);
    expect(source.hasFamily('murakami')).toBe(true);
    expect(source.has('haruki')).toBe(true);
  });
});
