/**
 * ASCII-folds a Latin word for dictionary lookup: NFD-decompose, strip combining
 * marks, and replace the precomposed Latin letters that NFD does NOT decompose
 * with their conventional ASCII transliteration. Case is preserved; callers
 * lowercase as needed.
 *
 * NFD already handles every letter+diacritic pair that decomposes — é, ñ, ü, å,
 * ç — by splitting the base letter from its combining mark and dropping the
 * mark. What it does NOT handle is a small set of historic ligatures and stroked
 * letters that are encoded as a single, atomic codepoint:
 *
 *   ø/Ø  (Nordic)         æ/Æ  (Old English / Nordic / Icelandic)
 *   œ/Œ  (French ligature) ß/ẞ  (German sharp s)
 *   ł/Ł  (Polish)          ð/Ð  (Icelandic/Faroese eth)
 *   þ/Þ  (Icelandic thorn) ı    (Turkish dotless i)
 *   đ/Đ  (Vietnamese / Croatian d-with-stroke)
 *
 * Without this mapping a name written in its native orthography ("Jørgensen",
 * "Łukasz", "Aðalsteinsson", "Reuß") cannot match its ASCII-folded form in the
 * shipped DB ("jorgensen", "lukasz", "adalsteinsson", "reuss") even though the
 * Census / Wikidata ingest sources already supply that folded form for the very
 * same people — the precomposed entries were unreachable from real prose.
 *
 * Build-time (`scripts/build-db/romanize-hangul.ts` → `asciiFold`) and runtime
 * (`src/core/detectors/names.ts` → `foldLatin`) MUST apply the same rule or DB
 * entries will be stored under one form and looked up under another; both call
 * this helper.
 */
const COMBINING_MARKS = /[̀-ͯ]/g;
const PRECOMPOSED = /[øØæÆœŒßẞłŁðÐþÞıđĐ]/g;
const PRECOMPOSED_MAP: Record<string, string> = {
  ø: 'o',
  Ø: 'O',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ß: 'ss',
  ẞ: 'SS',
  ł: 'l',
  Ł: 'L',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'TH',
  ı: 'i',
  đ: 'd',
  Đ: 'D',
};

export function latinFold(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(PRECOMPOSED, (c) => PRECOMPOSED_MAP[c] ?? c);
}
