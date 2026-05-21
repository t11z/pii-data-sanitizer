import type { NameSource } from '../types';
import { BloomFilter } from './bloom';

/**
 * NameSource backed by Bloom-filter language packs. Multiple packs can be merged
 * so the active set of languages is looked up together. Lookups expect a
 * lowercased string (matching how packs are built).
 */
export class BloomNameSource implements NameSource {
  private given: BloomFilter[] = [];
  private family: BloomFilter[] = [];

  addPack(given: BloomFilter, family: BloomFilter): void {
    this.given.push(given);
    this.family.push(family);
  }

  hasGiven(name: string): boolean {
    return this.given.some((f) => f.has(name));
  }

  hasFamily(name: string): boolean {
    return this.family.some((f) => f.has(name));
  }

  has(name: string): boolean {
    return this.hasGiven(name) || this.hasFamily(name);
  }
}
