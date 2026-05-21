import type { Script } from '../../src/core/types';

/**
 * The single source of truth for name data (build input). `scripts/build-db`
 * compiles this into Bloom-filter packs under public/packs; tests build an
 * in-memory PackNameSource from the same lists. There is no runtime seed and no
 * parallel hand-maintained list elsewhere.
 *
 * This is a curated starter set. It grows over time from permissively licensed
 * public sources (e.g. Wikidata CC0, open census/SSA data) via the
 * self-improvement loop. Everything is lowercased. Names are partitioned by
 * SCRIPT, not by culture: all romanized names (European + transliterated
 * Indian/Arabic/Hebrew/Persian + Chinese Pinyin + Japanese Romaji) live in the
 * single `Latin` list; native-script names get their own lists.
 */
export interface NameSourceList {
  /** Script the pack serves; drives automatic loading from detected text. */
  script: Script;
  /** Frequency tier within a script. Only Latin is sharded today. */
  tier: 'core' | 'ext';
  /** Provenance / license of the data (recorded in the manifest). */
  license: string;
  /** Lowercased given + family names (deduped at build time). */
  names: string[];
}

const LATIN: string[] = [
  // --- European given ---
  'hans',
  'kai',
  'uwe',
  'kai-uwe',
  'klaus',
  'jürgen',
  'wolfgang',
  'dieter',
  'lukas',
  'lena',
  'anna',
  'julia',
  'sophie',
  'emma',
  'john',
  'james',
  'robert',
  'michael',
  'william',
  'david',
  'mary',
  'patricia',
  'jennifer',
  'linda',
  'oliver',
  'emily',
  'george',
  'thomas',
  'jean',
  'pierre',
  'michel',
  'claire',
  'antoine',
  'camille',
  'jose',
  'juan',
  'carlos',
  'maria',
  'sofia',
  'diego',
  'marco',
  'luca',
  'giuseppe',
  'francesca',
  'giulia',
  'joao',
  'pedro',
  'mateus',
  'beatriz',
  'jan',
  'pieter',
  'sanne',
  'piotr',
  'katarzyna',
  'agnieszka',
  // --- Indian (transliterated) given ---
  'priya',
  'rajesh',
  'arjun',
  'anjali',
  'ravi',
  'sanjay',
  'deepak',
  'kavya',
  'aditya',
  'lakshmi',
  'meera',
  'vikram',
  'pradeep',
  // --- Arabic (transliterated) given ---
  'mohammed',
  'ahmed',
  'omar',
  'ali',
  'fatima',
  'aisha',
  'yusuf',
  'ibrahim',
  'khalid',
  'farah',
  // --- Hebrew (transliterated) given ---
  'moshe',
  'sarah',
  'rivka',
  'yosef',
  'noa',
  'avraham',
  // --- Persian (transliterated) given ---
  'reza',
  'farhad',
  'leila',
  'kourosh',
  'darius',
  'parisa',
  'ramin',
  // --- Chinese (Pinyin) given ---
  'wei',
  'fang',
  'jing',
  'lei',
  'ming',
  'yan',
  'hui',
  'na',
  // --- Japanese (Romaji) given ---
  'haruki',
  'takashi',
  'yuki',
  'akira',
  'hiroshi',
  'kenji',
  'sakura',
  'yuna',
  // --- European family ---
  'müller',
  'schmidt',
  'schneider',
  'braun',
  'weber',
  'fischer',
  'wagner',
  'becker',
  'hoffmann',
  'smith',
  'johnson',
  'williams',
  'jones',
  'davis',
  'wilson',
  'taylor',
  'anderson',
  'martin',
  'bernard',
  'dubois',
  'durand',
  'garcia',
  'rodriguez',
  'gonzalez',
  'fernandez',
  'lopez',
  'rossi',
  'russo',
  'ferrari',
  'esposito',
  'silva',
  'santos',
  'oliveira',
  'souza',
  'jansen',
  'visser',
  'nowak',
  'kowalski',
  'wisniewski',
  // --- Indian (transliterated) family ---
  'sharma',
  'patel',
  'singh',
  'kumar',
  'gupta',
  'reddy',
  'nair',
  'rao',
  'chatterjee',
  'shrivastava',
  // --- Arabic (transliterated) family ---
  'farouk',
  'hassan',
  'khalil',
  'said',
  'mansour',
  // --- Hebrew (transliterated) family ---
  'cohen',
  'levi',
  'mizrahi',
  'peretz',
  'gurion',
  // --- Persian (transliterated) family ---
  'tehrani',
  'ahmadi',
  'hosseini',
  'karimi',
  'javaheri',
  // --- Chinese (Pinyin) family ---
  'wang',
  'li',
  'zhang',
  'liu',
  'chen',
  'huang',
  'zhao',
  'zhou',
  // --- Japanese (Romaji) family ---
  'sato',
  'suzuki',
  'takahashi',
  'tanaka',
  'watanabe',
  'yamamoto',
  'nakamura',
  'kobayashi',
  'murakami',
];

const ARABIC: string[] = ['محمد', 'علي', 'فاطمة', 'حسن'];
const HEBREW: string[] = ['דוד', 'שרה', 'כהן', 'לוי'];
const DEVANAGARI: string[] = ['प्रिया', 'अर्जुन', 'शर्मा', 'पटेल'];

const CURATED = 'project-curated (starter set; expand via Wikidata CC0 / open census data)';

export const SOURCES: NameSourceList[] = [
  { script: 'Latin', tier: 'core', license: CURATED, names: LATIN },
  { script: 'Arabic', tier: 'core', license: CURATED, names: ARABIC },
  { script: 'Hebrew', tier: 'core', license: CURATED, names: HEBREW },
  { script: 'Devanagari', tier: 'core', license: CURATED, names: DEVANAGARI },
];
