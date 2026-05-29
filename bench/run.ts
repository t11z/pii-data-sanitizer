/**
 * Benchmark harness. Computes precision/recall/F1 against a labeled corpus and
 * enforces two gates used by CI and the self-improvement loop:
 *
 *   1. The "proven" suite (bench/proven) must pass EXACTLY — zero false
 *      positives and zero false negatives. This is the locked, already-proven
 *      set the self-improvement loop may keep green but must never rewrite.
 *   2. Overall F1 on the corpus must not drop below the committed baseline
 *      (bench/baseline.json).
 *
 * Run `tsx bench/run.ts` to evaluate, or with `--update` to (re)write the
 * baseline after an intentional, reviewed improvement.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detect } from '../src/core/index';
import type { PiiType } from '../src/core/index';
import { PackNameSource } from '../src/core/db/packSource';
import { SOURCES } from '../scripts/build-db/sources';
import type { Script } from '../src/core/types';

// Build the same merged dictionary the production packs ship: curated sources
// (Latin = core) plus the ingested bulk under scripts/build-db/data (Latin =
// ext, native scripts = core). This way the benchmark gate exercises the real
// shipped data, so a bulk addition that introduces false positives is caught.
function buildNameSource(): PackNameSource {
  const src = new PackNameSource();
  for (const s of SOURCES) {
    src.addWords(s.names, { script: s.script, tier: s.tier }, `${s.script}-${s.tier}`);
  }
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'build-db', 'data');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const p = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { script: Script; names: string[] };
      const tier = p.script === 'Latin' ? 'ext' : 'core';
      src.addWords(p.names, { script: p.script, tier }, f);
    }
  }
  return src;
}

const nameSource = buildNameSource();

interface Entity {
  type: PiiType;
  text: string;
}
interface Case {
  text: string;
  entities: Entity[];
}
interface Metrics {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}

const here = dirname(fileURLToPath(import.meta.url));

function load(path: string): Case[] {
  return JSON.parse(readFileSync(path, 'utf8')) as Case[];
}

function key(e: Entity): string {
  return `${e.type}|${e.text.normalize('NFC')}`;
}

function metrics(tp: number, fp: number, fn: number): Metrics {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, tp, fp, fn };
}

interface Eval {
  overall: Metrics;
  byType: Record<string, Metrics>;
  failures: Array<{ text: string; fp: string[]; fn: string[] }>;
}

function evaluate(cases: Case[]): Eval {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const per: Record<string, { tp: number; fp: number; fn: number }> = {};
  const bump = (type: string, field: 'tp' | 'fp' | 'fn') => {
    per[type] ??= { tp: 0, fp: 0, fn: 0 };
    per[type][field]++;
  };
  const failures: Eval['failures'] = [];

  for (const c of cases) {
    const detected = new Set(
      detect(c.text, { nameSource }).map((s) => key({ type: s.type, text: s.text }))
    );
    const expected = new Set(c.entities.map(key));
    const caseFp: string[] = [];
    const caseFn: string[] = [];

    for (const k of expected) {
      const type = k.split('|')[0];
      if (detected.has(k)) {
        tp++;
        bump(type, 'tp');
      } else {
        fn++;
        bump(type, 'fn');
        caseFn.push(k);
      }
    }
    for (const k of detected) {
      if (!expected.has(k)) {
        fp++;
        bump(k.split('|')[0], 'fp');
        caseFp.push(k);
      }
    }
    if (caseFp.length || caseFn.length) {
      failures.push({ text: c.text, fp: caseFp, fn: caseFn });
    }
  }

  const byType: Record<string, Metrics> = {};
  for (const [type, t] of Object.entries(per)) {
    byType[type] = metrics(t.tp, t.fp, t.fn);
  }
  return { overall: metrics(tp, fp, fn), byType, failures };
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function printEval(title: string, e: Eval): void {
  const m = e.overall;
  console.log(`\n=== ${title} ===`);
  console.log(
    `Overall  P=${pct(m.precision)}  R=${pct(m.recall)}  F1=${pct(m.f1)}  (tp=${m.tp} fp=${m.fp} fn=${m.fn})`
  );
  for (const [type, tm] of Object.entries(e.byType).sort()) {
    console.log(
      `  ${type.padEnd(12)} P=${pct(tm.precision)}  R=${pct(tm.recall)}  F1=${pct(tm.f1)}`
    );
  }
}

function reportTable(e: Eval): string {
  const row = (name: string, m: Metrics) =>
    `| ${name.padEnd(12)} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} | ${m.tp} | ${m.fp} | ${m.fn} |`;
  const lines = [
    '| Type | Precision | Recall | F1 | TP | FP | FN |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...Object.entries(e.byType)
      .sort()
      .map(([t, m]) => row(t, m)),
    row('**Overall**', e.overall),
  ];
  return lines.join('\n');
}

function writeReport(corpus: Eval, proven: Eval): void {
  const md = `# Evaluation report

<!-- Generated by \`tsx bench/run.ts --report\`. Do not edit by hand. -->

Generated: ${new Date().toISOString()}

These are the numbers the CI gate enforces on every PR. See
[\`docs/evaluation.md\`](evaluation.md) for the methodology and important caveats
(notably: the corpus is a curated regression gate, not a held-out wild benchmark).

## Corpus

${reportTable(corpus)}

## Proven suite (must be exact — zero FP/FN)

${reportTable(proven)}
`;
  const out = join(here, '..', 'docs', 'eval-report.md');
  writeFileSync(out, md);
  console.log(`\n✅ Report written: ${out}`);
}

const update = process.argv.includes('--update');
const report = process.argv.includes('--report');

const corpus = evaluate(load(join(here, 'corpus.json')));
const proven = evaluate(load(join(here, 'proven', 'cases.json')));

printEval('Corpus', corpus);
printEval('Proven suite', proven);

if (report) writeReport(corpus, proven);

let failed = false;

if (proven.overall.fp > 0 || proven.overall.fn > 0) {
  failed = true;
  console.error('\n❌ Proven suite regressed (must be exact). Offending cases:');
  for (const f of proven.failures) {
    console.error(`  • "${f.text}"`);
    if (f.fp.length) console.error(`      false positives: ${f.fp.join(', ')}`);
    if (f.fn.length) console.error(`      missed:          ${f.fn.join(', ')}`);
  }
}

const baselinePath = join(here, 'baseline.json');
if (update) {
  writeFileSync(baselinePath, JSON.stringify({ overallF1: corpus.overall.f1 }, null, 2) + '\n');
  console.log(`\n✅ Baseline written: overall F1 = ${pct(corpus.overall.f1)}`);
} else if (existsSync(baselinePath)) {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as { overallF1: number };
  console.log(
    `\nBaseline F1 = ${pct(baseline.overallF1)} | current F1 = ${pct(corpus.overall.f1)}`
  );
  if (corpus.overall.f1 + 1e-9 < baseline.overallF1) {
    failed = true;
    console.error('❌ Overall F1 dropped below the committed baseline.');
  }
} else {
  console.log('\n(no baseline.json yet — run with --update to create one)');
}

if (failed) process.exit(1);
console.log('\n✅ All benchmark gates passed.');
