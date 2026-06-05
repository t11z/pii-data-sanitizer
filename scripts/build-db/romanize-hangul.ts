/**
 * Build-time transliteration helpers for the name ingestion pipeline.
 *
 * `romanizeHangul` converts Korean Hangul to lowercased Revised Romanization so
 * harvested native names also match romanized text (e.g. "김민준" → "kimminjun"
 * via surname override + "minjun"). `asciiFold` strips diacritics so Vietnamese
 * (and other accented Latin) names match an ASCII rendering ("Nguyễn" → "nguyen").
 *
 * Both are pure and offline — they run only when refreshing committed data
 * (`npm run ingest`), never in the browser engine.
 */

// Revised Romanization syllable tables. A modern Hangul syllable block
// (U+AC00..U+D7A3) decomposes arithmetically into (initial, medial, final).
const INITIALS = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's',
  'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];
const MEDIALS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa',
  'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];
// Index 0 = no final consonant. RR "final position" forms (no cross-syllable
// liaison): the safe choice for an isolated name dictionary.
const FINALS = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l',
  'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't',
];

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;

/**
 * Conventional romanizations of the most common Korean surnames. These do NOT
 * follow Revised Romanization (RR would give "gim", "i", "bak"), so they are
 * curated. Values are additive — the RR fallback is emitted too, so every
 * accepted spelling matches. Lowercased; multiple variants where in common use.
 */
export const SURNAME_OVERRIDES: Record<string, string[]> = {
  김: ['kim'],
  이: ['lee', 'yi', 'rhee'],
  박: ['park', 'bak'],
  최: ['choi', 'choe'],
  정: ['jung', 'jeong', 'chung'],
  강: ['kang'],
  조: ['cho', 'jo'],
  윤: ['yoon', 'yun'],
  장: ['jang', 'chang'],
  임: ['lim', 'im'],
  한: ['han'],
  오: ['oh', 'o'],
  서: ['seo', 'suh'],
  신: ['shin', 'sin'],
  권: ['kwon'],
  황: ['hwang'],
  안: ['ahn', 'an'],
  송: ['song'],
  전: ['jeon', 'jun', 'chun'],
  홍: ['hong'],
  유: ['yoo', 'yu'],
  고: ['ko', 'go', 'koh'],
  문: ['moon', 'mun'],
  양: ['yang'],
  손: ['son', 'sohn'],
  배: ['bae'],
  백: ['baek', 'paik', 'baik'],
  허: ['heo', 'hur', 'huh'],
  남: ['nam'],
  심: ['shim', 'sim'],
  노: ['noh', 'no', 'roh'],
  하: ['ha'],
  곽: ['kwak', 'gwak'],
  성: ['sung', 'seong'],
  차: ['cha'],
  주: ['joo', 'ju'],
  우: ['woo'],
  구: ['koo', 'ku', 'goo'],
  민: ['min'],
  류: ['ryu', 'yoo', 'lyu'],
  나: ['na', 'ra'],
  진: ['jin', 'chin'],
  지: ['ji', 'jee'],
  엄: ['eom', 'um'],
  변: ['byun', 'byeon'],
  원: ['won'],
  천: ['cheon', 'chun'],
  방: ['bang', 'pang'],
  공: ['kong', 'gong'],
  현: ['hyun', 'hyeon'],
  함: ['ham'],
  염: ['yeom', 'yum'],
  여: ['yeo'],
  추: ['chu', 'choo'],
  도: ['do', 'doh'],
  소: ['so', 'soh'],
  석: ['seok', 'suk'],
  선: ['sun', 'seon'],
  설: ['seol', 'sul'],
  마: ['ma'],
  길: ['gil', 'kil'],
  연: ['yeon', 'youn'],
  위: ['wi', 'wee'],
  표: ['pyo'],
  명: ['myung', 'myeong'],
  기: ['ki', 'gi'],
  반: ['ban', 'pan'],
  왕: ['wang'],
  금: ['keum', 'geum'],
  옥: ['ok'],
  육: ['yook', 'yuk'],
  인: ['in'],
  맹: ['maeng'],
  제: ['je'],
  모: ['mo'],
  탁: ['tak', 'tark'],
  국: ['kook', 'guk'],
  은: ['eun'],
  편: ['pyeon', 'pyun'],
  용: ['yong'],
  예: ['ye'],
  경: ['kyung', 'gyeong'],
  봉: ['bong'],
  사: ['sa'],
  부: ['boo', 'bu'],
};

function romanizeSyllable(code: number): string {
  const s = code - SYLLABLE_BASE;
  const final = s % 28;
  const medial = ((s - final) / 28) % 21;
  const initial = ((s - final) / 28 - medial) / 21;
  return INITIALS[initial] + MEDIALS[medial] + FINALS[final];
}

/**
 * Revised Romanization of a Hangul token, lowercased. Non-Hangul characters
 * (already-Latin letters, digits, hyphens) pass through unchanged so mixed or
 * non-Korean input is preserved.
 */
export function romanizeHangul(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= SYLLABLE_BASE && code <= SYLLABLE_LAST ? romanizeSyllable(code) : ch;
  }
  return out.toLowerCase();
}

/**
 * Strips diacritics to an ASCII-folded form. The rule is shared with the runtime
 * lookup (`src/core/detectors/names.ts` → `foldLatin`) so a name stored under
 * its folded form here is found by the same fold there — see
 * `src/core/latinFold.ts` for the per-character rationale (Nordic ø/æ, German
 * ß, Polish ł, Icelandic ð/þ, Turkish ı, Vietnamese đ, …). Case is preserved;
 * callers lowercase as needed.
 */
export { latinFold as asciiFold } from '../../src/core/latinFold';
