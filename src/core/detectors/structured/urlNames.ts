import type { NameSource, Span } from '../../types';
import { givenHit, familyHit } from '../names';
import { isParticle } from '../../context/particles';
import { isFunctionalMailbox } from '../../context/mailboxes';
import { isNonNameWord } from '../../context/roleWords';

// Explicit URLs only (scheme or leading www.), bounded by whitespace and common
// delimiters. Bare hostnames are intentionally not matched: requiring a scheme
// keeps prose like "see foo.bar" from being scanned for names.
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`)\]}]+/giu;

// Letter runs inside a URL. URLs are ASCII in practice; \p{L} also tolerates the
// occasional IRI. Offsets are relative to the URL substring.
const SEGMENT_RE = /[\p{L}\p{M}]+/gu;

// Separators that join the parts of one person's name in a URL slug
// ("joost.vandenberg", "anna_meier", "k-mueller"). A "/" or "@" ends the pair —
// parts in different path components are not treated as one name.
const PAIR_SEP = new Set(['.', '_', '-', '+']);

// Structural URL words that are never a person, on top of the shared mailbox /
// non-name lists. Kept lowercase.
const URL_STOPWORDS = new Set<string>([
  'www',
  'meet',
  'api',
  'app',
  'apps',
  'user',
  'users',
  'profile',
  'profiles',
  'login',
  'logout',
  'signin',
  'signup',
  'register',
  'home',
  'index',
  'page',
  'pages',
  'view',
  'search',
  'about',
  'blog',
  'news',
  'docs',
  'doc',
  'static',
  'assets',
  'img',
  'images',
  'image',
  'cdn',
  'media',
  'files',
  'download',
  'downloads',
  'web',
  'public',
  'shared',
  'share',
  'join',
  'room',
  'rooms',
  'channel',
  'channels',
  'event',
  'events',
  'calendar',
  'settings',
  'config',
  'auth',
  'oauth',
  'sso',
  'go',
  'link',
  'links',
  'ref',
]);

// Common TLDs and country codes — skipped wherever they appear so "smith.com" or
// "baker.co.uk" never contribute a name part.
const TLDS = new Set<string>([
  'com',
  'org',
  'net',
  'edu',
  'gov',
  'mil',
  'int',
  'info',
  'biz',
  'io',
  'co',
  'us',
  'uk',
  'de',
  'fr',
  'nl',
  'es',
  'it',
  'eu',
  'ca',
  'au',
  'ch',
  'at',
  'be',
  'se',
  'no',
  'dk',
  'fi',
  'pl',
  'ru',
  'jp',
  'cn',
  'in',
  'br',
  'pt',
  'ie',
  'cz',
]);

function known(source: NameSource, word: string): boolean {
  return givenHit(source, word, 'Latin') || familyHit(source, word, 'Latin');
}

/** A segment that can never be a name part (structural word, particle, TLD). */
function isStopSegment(word: string): boolean {
  const l = word.toLowerCase();
  return (
    URL_STOPWORDS.has(l) ||
    TLDS.has(l) ||
    isFunctionalMailbox(l) ||
    isNonNameWord(l) ||
    isParticle(l)
  );
}

interface Seg {
  text: string;
  start: number;
  end: number;
}

/**
 * Conservatively detects person names inside URLs. Only flags a name when TWO
 * adjacent parts corroborate each other within one slug — a known given/family
 * pair ("joost.vandenberg", "anna_meier") or an initial + known surname
 * ("j.vandenberg", "jvandenberg"). A lone known label (e.g. the surname-shaped
 * subdomain "morgan.com") is never flagged, so company domains stay intact.
 *
 * Emits PERSON spans only for the name parts, leaving the URL skeleton in place
 * ("https://[PERSON].webex.com/meet/[PERSON]").
 */
export function detectNamesInUrls(text: string, source: NameSource): Span[] {
  const spans: Span[] = [];

  for (const url of text.matchAll(URL_RE)) {
    const base = url.index;
    const body = url[0];
    // Only scan the PATH/query, not the host. Multi-label hosts are usually
    // geographic or structural ("los.angeles...", "mail.google.com",
    // "en.wikipedia.org"); person-name slugs live after the first "/" ("?"/"#").
    // This keeps "/meet/joost.vandenberg" while dropping host-part false positives.
    const segs: Seg[] = [];
    const authority = body.includes('://') ? body.indexOf('://') + 3 : 0;
    const pathRel = body.slice(authority).search(/[/?#]/);
    if (pathRel < 0) continue;
    const pathStart = authority + pathRel;
    for (const s of body.matchAll(SEGMENT_RE)) {
      if (s.index < pathStart) continue;
      segs.push({ text: s[0], start: s.index, end: s.index + s[0].length });
    }

    let k = 0;
    while (k < segs.length) {
      const a = segs[k];
      const b = segs[k + 1];
      const adjacent = !!b && PAIR_SEP.has(body.slice(a.end, b.start)) && a.end + 1 === b.start;

      if (adjacent && pairIsName(source, a.text, b.text)) {
        spans.push(span(text, base + a.start, base + b.end));
        k += 2;
        continue;
      }

      const glued = gluedInitialFamily(source, a.text);
      if (glued) {
        spans.push(span(text, base + a.start, base + a.end));
      }
      k += 1;
    }
  }

  return spans;
}

/** Two adjacent slug parts that together name a person. */
function pairIsName(source: NameSource, a: string, b: string): boolean {
  // An initial pairs with a real surname on either side ("j.smith", "smith.j").
  if (a.length === 1 && b.length >= 4 && !isStopSegment(b)) return known(source, b);
  if (b.length === 1 && a.length >= 4 && !isStopSegment(a)) return known(source, a);
  if (a.length < 2 || b.length < 2) return false;
  if (isStopSegment(a) || isStopSegment(b)) return false;
  return known(source, a) && known(source, b);
}

/**
 * A single glued slug part "jvandenberg" = leading initial + known surname.
 * Skipped when the whole label is itself a known name ("morgan", "baker"): those
 * are lone labels, not initial+surname, and must not be split (m+"organ").
 */
function gluedInitialFamily(source: NameSource, word: string): boolean {
  if (word.length < 5 || isStopSegment(word) || known(source, word)) return false;
  const rest = word.slice(1);
  return rest.length >= 4 && !isStopSegment(rest) && known(source, rest);
}

function span(text: string, start: number, end: number): Span {
  return {
    start,
    end,
    type: 'PERSON',
    text: text.slice(start, end),
    confidence: 0.9,
    source: 'url',
  };
}
