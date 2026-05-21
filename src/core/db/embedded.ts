import type { NameSource } from '../types';
import { GIVEN_NAMES, FAMILY_NAMES } from './embeddedData';

export class SetNameSource implements NameSource {
  private given: Set<string>;
  private family: Set<string>;

  constructor(given: Iterable<string>, family: Iterable<string>) {
    this.given = new Set([...given].map((n) => n.toLowerCase()));
    this.family = new Set([...family].map((n) => n.toLowerCase()));
  }

  hasGiven(name: string): boolean {
    return this.given.has(name);
  }

  hasFamily(name: string): boolean {
    return this.family.has(name);
  }

  has(name: string): boolean {
    return this.given.has(name) || this.family.has(name);
  }
}

/** Default embedded name oracle used when the caller does not supply one. */
export const defaultNameSource: NameSource = new SetNameSource(GIVEN_NAMES, FAMILY_NAMES);
