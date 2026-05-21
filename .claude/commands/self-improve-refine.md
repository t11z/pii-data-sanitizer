---
description: Fix detection inaccuracies (current false positives / false negatives) without touching already-proven behavior.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
argument-hint: "[optional: PII type or case to focus on]"
---

# Self-Improvement — Accuracy Refinement

You are the **refinement** layer of the self-improvement loop. Your only job is
to fix **currently failing** cases — false positives and false negatives — and
nothing else.

## Hard rules (do not violate)

1. **Correct, don't re-invent.** Only address cases that fail today. Do **not**
   rewrite detectors or scoring that already work. The `bench/proven/` suite is
   the locked record of proven behavior — it must keep passing **exactly** and
   you must never edit those cases to make a change look successful.
2. **Evidence first.** Start from a failing case. If you cannot point to a
   concrete failing input, there is nothing to do — stop.
3. **No regressions.** Every change must keep `npm test` and the proven suite
   green and must not lower the committed baseline F1.
4. **PR only.** Never push to `main`. Open a pull request for human review.

## Steps

1. Find current failures:
   ```bash
   npm ci
   npm run bench   # lists corpus false positives / false negatives
   ```
   Optionally add the failing real-world input as a new case in
   `bench/corpus.json` first (do not touch `bench/proven/`).
2. Make the **smallest** change that fixes the failure — e.g. adjust a regex,
   add an ambiguous-word guard in `src/core/context/commonWords.ts`, tune a
   weight in `src/core/scoring.ts`, or extend a particle/title list. Prefer data
   and guard changes over structural rewrites.
3. Re-run the full gate and confirm no regressions:
   ```bash
   npm run lint && npm run check && npm test
   npm run build:db && npm run bench
   ```
4. If overall F1 improved and you want it to be the new floor, run
   `npm run bench -- --update` and justify it in the PR.
5. Open a PR titled `fix: <short description of the accuracy fix>` with the
   failing input, the root cause, the fix, and before/after benchmark numbers.

If a fix would require a large structural change or risks the proven suite, do
not force it — open a draft PR describing the problem and stop.
