import type { NameSource } from '../types';
import { foldLatin, givenHit, familyHit } from '../detectors/names';
import { isFunctionalMailbox } from '../context/mailboxes';

/** A name token inferred from an email address, used for cross-reference and linking. */
export interface DerivedName {
  /** Lowercased, diacritic-folded token (matches the dictionary's canonical form). */
  text: string;
  kind: 'given' | 'family';
  source: 'email';
}

const SEP = /[._-]+/;

/** Drop leading/trailing digit runs so "mueller123" / "07jane" reduce to the word. */
function stripDigits(s: string): string {
  return s.replace(/^\d+/, '').replace(/\d+$/, '');
}

/** True when the base dictionary knows this token as a given or family name. */
function dbHit(source: NameSource, word: string): boolean {
  return givenHit(source, word, 'Latin') || familyHit(source, word, 'Latin');
}

/**
 * Infers candidate name tokens from an email local part, gated on the name
 * database so noise ("xz9", "k8") never becomes a name. Handles three shapes:
 *
 *   - `guenther.mueller` → split on separators; each DB-confirmed part is taken
 *     (first → given, last → family).
 *   - `mueller`          → a lone DB-confirmed token (taken as family).
 *   - `gmueller`         → initial-strip: drop one leading letter; if the
 *     remainder is a DB family name, take it as the surname.
 *
 * Functional mailboxes (info@, support@, noreply@, …) yield nothing.
 * Returns folded tokens so accented mentions ("Müller") match later.
 */
export function deriveNamesFromEmail(localPart: string, source: NameSource): DerivedName[] {
  const lower = localPart.toLowerCase();
  if (!lower) return [];

  const segments = lower.split(SEP).filter(Boolean);
  if (segments.length === 0) return [];
  // Any functional segment (or the whole local part) disqualifies the address.
  if (isFunctionalMailbox(lower) || segments.some(isFunctionalMailbox)) return [];

  const out: DerivedName[] = [];
  const add = (word: string, kind: 'given' | 'family') => {
    const text = foldLatin(word.toLowerCase());
    if (text.length >= 2 && !out.some((d) => d.text === text)) {
      out.push({ text, kind, source: 'email' });
    }
  };

  if (segments.length >= 2) {
    segments.forEach((raw, idx) => {
      const part = stripDigits(raw);
      if (part.length >= 2 && dbHit(source, part)) {
        add(part, idx === segments.length - 1 ? 'family' : 'given');
      }
    });
    return out;
  }

  const part = stripDigits(segments[0]);
  if (part.length >= 2 && dbHit(source, part)) {
    add(part, 'family');
    return out;
  }
  // Initial-strip: "gmueller" → "mueller". One leading letter, DB family match.
  if (part.length >= 4) {
    const rest = part.slice(1);
    if (rest.length >= 3 && familyHit(source, rest, 'Latin')) {
      add(rest, 'family');
    }
  }
  return out;
}
