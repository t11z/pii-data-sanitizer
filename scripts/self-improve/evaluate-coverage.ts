/**
 * Coverage-discovery evaluator for the daily self-improvement loop.
 *
 * Reads a synthetic, PII-dense corpus produced by the generation step
 * (bench/self-improve/generated.json), runs the real detector over each case,
 * and writes a machine-readable gap report (bench/self-improve/gaps.json) plus a
 * human summary. The report is what the Opus analysis step consumes to find the
 * root cause of coverage gaps and propose a fix.
 *
 * This is a DISCOVERY tool, not a gate: its input is fresh/varied each run, it is
 * never committed, and it never edits the locked corpora. Only a human-reviewed,
 * minimized case from a gap should ever land in bench/corpus.json.
 *
 * Run via `npm run bench:coverage`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detect } from '../../src/core/index';
import { ALL_PII_TYPES } from '../../src/core/index';
import type { PiiType, Span } from '../../src/core/index';
import { nameSourceFromBuildInputs } from '../../src/core/db/fromSources';

interface Entity {
  type: PiiType;
  text: string;
}
interface Case {
  text: string;
  entities: Entity[];
}
interface Miss {
  type: PiiType;
  text: string;
  context: string;
}
interface TypeStat {
  expected: number;
  detected: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'bench', 'self-improve');
const inputPath = join(outDir, 'generated.json');
const outputPath = join(outDir, 'gaps.json');

const PII_TYPES = new Set<string>(ALL_PII_TYPES);
// Use the full committed dictionary (curated core + ingested ext) so the gap
// report reflects what the shipped app actually knows — not just the small
// curated subset. Otherwise every ext-tier name surfaces as a false gap.
const nameSource = nameSourceFromBuildInputs();

function nfc(s: string): string {
  return s.normalize('NFC');
}

function loadCases(path: string): Case[] {
  if (!existsSync(path)) {
    console.error(
      `❌ No generated corpus at ${path}.\n` +
        '   The generation step (/self-improve-coverage-generate) must write it first.'
    );
    process.exit(1);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`❌ ${path} is not valid JSON: ${(err as Error).message}`);
    process.exit(1);
  }
  if (!Array.isArray(raw)) {
    console.error(`❌ ${path} must be a JSON array of { text, entities[] } cases.`);
    process.exit(1);
  }
  return raw as Case[];
}

/** PERSON spans match leniently: name boundaries vary, so containment counts. */
function personOverlap(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
}

function emptyStat(): TypeStat {
  return { expected: 0, detected: 0, tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 };
}

function finalize(stat: TypeStat): void {
  stat.precision = stat.tp + stat.fp === 0 ? 1 : stat.tp / (stat.tp + stat.fp);
  stat.recall = stat.tp + stat.fn === 0 ? 1 : stat.tp / (stat.tp + stat.fn);
  stat.f1 =
    stat.precision + stat.recall === 0
      ? 0
      : (2 * stat.precision * stat.recall) / (stat.precision + stat.recall);
}

const stats: Record<string, TypeStat> = {};
const stat = (t: string): TypeStat => (stats[t] ??= emptyStat());

const falseNegatives: Miss[] = [];
const falsePositives: Miss[] = [];
const skippedTypes = new Set<string>();

const cases = loadCases(inputPath);

for (const c of cases) {
  const text = nfc(c.text ?? '');
  const expected = (c.entities ?? []).filter((e) => {
    if (!PII_TYPES.has(e.type)) {
      skippedTypes.add(e.type);
      return false;
    }
    return true;
  });
  const detected: Span[] = detect(text, { nameSource });

  // Split by structured vs PERSON; structured uses exact text match, PERSON is lenient.
  const expStructured = new Map<string, Entity>();
  const expPersons: Entity[] = [];
  for (const e of expected) {
    if (e.type === 'PERSON') expPersons.push({ type: 'PERSON', text: nfc(e.text) });
    else expStructured.set(`${e.type}|${nfc(e.text)}`, e);
  }
  const detStructured = new Map<string, Span>();
  const detPersons: Span[] = [];
  for (const s of detected) {
    if (s.type === 'PERSON') detPersons.push(s);
    else detStructured.set(`${s.type}|${nfc(s.text)}`, s);
  }

  for (const [k, e] of expStructured) {
    stat(e.type).expected++;
    if (detStructured.has(k)) {
      stat(e.type).tp++;
    } else {
      stat(e.type).fn++;
      falseNegatives.push({ type: e.type, text: e.text, context: c.text });
    }
  }
  for (const [k, s] of detStructured) {
    stat(s.type).detected++;
    if (!expStructured.has(k)) {
      stat(s.type).fp++;
      falsePositives.push({ type: s.type, text: s.text, context: c.text });
    }
  }

  // PERSON: greedy lenient matching so each detection/expectation is used once.
  const usedDet = new Set<number>();
  for (const e of expPersons) {
    stat('PERSON').expected++;
    const idx = detPersons.findIndex((d, i) => !usedDet.has(i) && personOverlap(d.text, e.text));
    if (idx >= 0) {
      usedDet.add(idx);
      stat('PERSON').tp++;
    } else {
      stat('PERSON').fn++;
      falseNegatives.push({ type: 'PERSON', text: e.text, context: c.text });
    }
  }
  for (let i = 0; i < detPersons.length; i++) {
    stat('PERSON').detected++;
    if (!usedDet.has(i)) {
      stat('PERSON').fp++;
      falsePositives.push({ type: 'PERSON', text: detPersons[i].text, context: c.text });
    }
  }
}

const totals = emptyStat();
for (const s of Object.values(stats)) {
  finalize(s);
  totals.expected += s.expected;
  totals.detected += s.detected;
  totals.tp += s.tp;
  totals.fp += s.fp;
  totals.fn += s.fn;
}
finalize(totals);
const { tp, fp, fn } = totals;

const report = {
  generatedAt: new Date().toISOString(),
  cases: cases.length,
  totals,
  byType: stats,
  falseNegatives,
  falsePositives,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

console.log(`\n=== Coverage discovery (${cases.length} synthetic cases) ===`);
console.log(
  `Overall  P=${pct(totals.precision)}  R=${pct(totals.recall)}  F1=${pct(totals.f1)}  (tp=${tp} fp=${fp} fn=${fn})`
);
for (const [type, s] of Object.entries(stats).sort()) {
  console.log(
    `  ${type.padEnd(12)} R=${pct(s.recall)}  P=${pct(s.precision)}  (missed=${s.fn} over=${s.fp})`
  );
}
if (skippedTypes.size) {
  console.warn(`\n⚠️  Ignored unknown entity types in ground truth: ${[...skippedTypes].join(', ')}`);
}
console.log(`\nMissed (false negatives): ${falseNegatives.length}`);
for (const m of falseNegatives.slice(0, 20)) {
  console.log(`  • ${m.type}: "${m.text}"`);
}
if (falseNegatives.length > 20) console.log(`  … and ${falseNegatives.length - 20} more`);
console.log(`\nOver-detected (false positives): ${falsePositives.length}`);
for (const m of falsePositives.slice(0, 20)) {
  console.log(`  • ${m.type}: "${m.text}"`);
}
if (falsePositives.length > 20) console.log(`  … and ${falsePositives.length - 20} more`);

console.log(`\n📄 Gap report written to ${outputPath}`);
