/**
 * Compact Bloom filter for name membership. Keeps language packs tiny so the
 * whole database can ship to the browser and be looked up in O(k). Membership
 * is probabilistic: `has` may yield false positives (handled downstream by the
 * confidence scoring) but never false negatives.
 */

const MAGIC = 0x50494942; // "PIIB"
const VERSION = 1;
const HEADER_BYTES = 12;

function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class BloomFilter {
  readonly bits: Uint8Array;
  readonly m: number;
  readonly k: number;

  constructor(m: number, k: number, bits?: Uint8Array) {
    this.m = m;
    this.k = k;
    this.bits = bits ?? new Uint8Array(Math.ceil(m / 8));
  }

  /** Sizes a filter for `n` items at false-positive probability `p`. */
  static forItems(n: number, p = 0.01): BloomFilter {
    const safeN = Math.max(1, n);
    const m = Math.max(8, Math.ceil((-safeN * Math.log(p)) / Math.LN2 ** 2));
    const k = Math.max(1, Math.round((m / safeN) * Math.LN2));
    return new BloomFilter(m, k);
  }

  private indexes(value: string): number[] {
    const h1 = fnv1a(value, 0x811c9dc5);
    const h2 = fnv1a(value, 0x9e3779b1) | 1;
    const out: number[] = [];
    for (let i = 0; i < this.k; i++) {
      out.push(((((h1 + Math.imul(i, h2)) >>> 0) % this.m) + this.m) % this.m);
    }
    return out;
  }

  add(value: string): void {
    for (const idx of this.indexes(value)) {
      this.bits[idx >> 3] |= 1 << (idx & 7);
    }
  }

  has(value: string): boolean {
    for (const idx of this.indexes(value)) {
      if ((this.bits[idx >> 3] & (1 << (idx & 7))) === 0) return false;
    }
    return true;
  }

  /** Serializes to a self-describing binary blob (header + bit array). */
  serialize(): Uint8Array {
    const out = new Uint8Array(HEADER_BYTES + this.bits.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, MAGIC, true);
    view.setUint16(4, VERSION, true);
    view.setUint16(6, this.k, true);
    view.setUint32(8, this.m, true);
    out.set(this.bits, HEADER_BYTES);
    return out;
  }

  static deserialize(buffer: ArrayBuffer | Uint8Array): BloomFilter {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a PIIB bloom pack');
    if (view.getUint16(4, true) !== VERSION) throw new Error('Unsupported pack version');
    const k = view.getUint16(6, true);
    const m = view.getUint32(8, true);
    const bits = bytes.slice(HEADER_BYTES);
    return new BloomFilter(m, k, bits);
  }
}
