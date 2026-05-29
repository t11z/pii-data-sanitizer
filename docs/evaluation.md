# Evaluation

How the sanitizer's accuracy is measured, what the numbers do and **do not** mean,
and how to reproduce them.

## Metrics

For each PII type and overall we report **precision**, **recall**, and **F1**, where a
prediction counts as a true positive only if both the **type** and the exact **text**
match a labeled entity (matching is done on the NFC-normalized string; see
`key()` in `bench/run.ts`). This is a strict, span-level match — a near-miss on the
boundary counts as both a false positive and a false negative.

The latest generated numbers live in [`eval-report.md`](eval-report.md)
(regenerate with `npm run bench -- --report`).

## The two gates

CI runs `npm run bench` on every PR and enforces two gates (`bench/run.ts`):

1. **Proven suite** (`bench/proven/cases.json`) — must pass **exactly**: zero false
   positives and zero false negatives. This is the locked set of already-proven
   behavior. The self-improvement loop may keep it green but must never rewrite it.
2. **Overall F1 baseline** (`bench/baseline.json`) — overall F1 on the corpus
   (`bench/corpus.json`) must not drop below the committed baseline. A regression
   fails the build.

The benchmark builds the **same merged dictionary the production packs ship** (curated
sources + ingested bulk under `scripts/build-db/data`), so a bulk name addition that
introduces a false positive is caught by the gate, not shipped.

## Important caveats — read this before quoting the numbers

The corpus currently reports F1 = 100%. That number means **"no known regression on a
curated set,"** not **"perfect in the wild."** Specifically:

- The corpus is a **regression gate**, hand-curated alongside the heuristics. It is
  intentionally green; its job is to fail loudly when a change breaks a known case.
- It is **not a held-out, representative sample** of real-world text, and it is small
  (tens of cases). It does not estimate field precision/recall on, say, arbitrary
  support tickets.
- Individual cases are still designed to **generalize** (held-out test values that are
  absent from the name dictionary — see the `nameVariants` / detector tests), so green
  is meaningful as a non-memorization signal, but it is not a population estimate.

To make a defensible real-world claim you would need a labeled, held-out corpus sampled
from the target distribution. Building one (and reporting the honest, sub-100% numbers it
produces) is tracked as future work.

## Reproduce

```bash
npm run build:db          # build the name packs the bench loads
npm run bench             # run both gates, print per-type + overall metrics
npm run bench -- --report # additionally (re)write docs/eval-report.md
npm run bench -- --update # (re)write the baseline after a reviewed improvement
```

## Comparison with Microsoft Presidio

To put the heuristic engine in context, `scripts/eval/compare_presidio.py` runs
[Microsoft Presidio](https://github.com/microsoft/presidio) over the **same**
`bench/corpus.json` and scores it with the **same** strict span-level metric, mapping
Presidio's entity labels onto this project's `PiiType`s. This is an eval-time script
only — it adds no runtime dependency and the browser app stays 100% offline.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install presidio-analyzer
python -m spacy download en_core_web_lg
python scripts/eval/compare_presidio.py
```

See [`comparison.md`](comparison.md) for the methodology, the label mapping, and how to
read the results.
