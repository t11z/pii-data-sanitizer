---
description: Analyze the coverage-gap report, find the root cause, and ship a generalizing heuristic fix as a labeled GitHub issue + PR (no dictionary dumps).
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
argument-hint: "[optional: PII type or culture to focus on]"
---

# Self-Improvement — Coverage Analysis & Heuristic Fix

You are the **analysis** step of the daily coverage-discovery loop. The previous
steps generated a synthetic, PII-dense TAC case feed and ran the real detector over
it. Your job: find the **root cause** of the most important coverage gap and ship a
fix that **generalizes** — a real heuristic improvement — as a **GitHub issue** + a
**PR**.

This loop is about **heuristics, not vocabulary.** Adding individual names to the
dictionary is the job of the separate `/self-improve-languages` loop. Your fixes must
make the *engine smarter* so it catches a whole **class** of cases — including names,
formats, and contexts it has never seen.

## Inputs

- `bench/self-improve/gaps.json` — the gap report: per-type recall/precision plus
  `falseNegatives` (missed PII) and `falsePositives` (over-detection), each with the
  surrounding case text. This is your evidence. (`bench/self-improve/generated.json`
  holds the raw synthetic feed if you need more context.)

Both files are ephemeral discovery artifacts — they are git-ignored. **Never** add
them to a commit.

## Hard rules (do not violate)

1. **Evidence first.** Work only from a concrete gap in `gaps.json`. No gap → stop,
   open nothing.
2. **Heuristic, not dictionary.** Ship a change that *generalizes* — detector logic,
   scoring, or a context list (titles, role/appositive cues, particles, guard words).
   **Adding specific names to `scripts/build-db/sources.ts` is OUT OF SCOPE here.** If
   the only possible fix for a gap is "add these names," do **not** do it: file a
   `languages`-labeled issue for the `/self-improve-languages` loop and move on to a
   gap that admits a generalizing fix (or stop if none does).
3. **Prove generalization.** The regression test for your fix MUST use **held-out
   values that are absent from the database**, verified against the **full committed
   dictionary** via `nameSourceFromBuildInputs()` (`hasGiven`/`hasFamily` === false).
   Do **not** verify with `nameSourceFromSources()`: that loads only the curated `core`
   subset, so every ingested `ext`-tier name reads as falsely absent — the exact error
   that produced a bogus "pure dictionary gap" diagnosis. If your fix only works because
   a value is in the DB, it is memorization, not a heuristic — reject it.
4. **Correct/extend, don't re-invent.** Make the smallest *generalizing* change. Do
   **not** rewrite working detectors wholesale. The `bench/proven/` suite is the
   locked record of proven behavior — it must keep passing **exactly** and you must
   never edit those cases.
5. **No regressions, protect precision.** `npm test`, the proven suite, and the
   baseline F1 must stay green. A recall fix that adds false positives is not
   acceptable — add **negative guard cases** to `bench/corpus.json` proving precision
   holds.
6. **Offline-only — no server-side resources, no external LLMs.** Every fix keeps the
   engine 100% client-side and offline (static data compiled at build time + pure
   local heuristics). **Forbidden:** any backend, network/API call at engine runtime,
   or hosted model. If a gap could only be closed that way, say so and **decline** it.
   (See `CONTRIBUTING.md`: "Zero-knowledge stays sacred… no network calls.")
7. **Issue + PR only — never merge, never push to `main`.**

## Steps

1. **Read the report.** `cat bench/self-improve/gaps.json`. Pick the **single
   highest-impact** gap that admits a *generalizing* fix. Use the argument as a focus
   hint. Reproduce it locally with a quick `tsx` probe calling `detect()` so you
   understand the real root cause before changing anything.
2. **Avoid duplicates.**
   ```bash
   gh issue list --label self-improvement --state open
   ```
   If one already covers this gap, add a brief comment with new evidence and **stop**.
3. **Trace the root cause to a heuristic lever** (not the dictionary):
   - missed names despite strong context (titles, "Account holder X", "Engineer X")
     → context cues in `src/core/context/` (`titles.ts`, `roleWords.ts`,
     `particles.ts`) and the start/extend logic in `src/core/detectors/names.ts`
   - over-detection / ambiguous or structural words → `src/core/context/commonWords.ts`,
     `src/core/context/roleWords.ts` (NON_NAME_WORDS), and `src/core/scoring.ts`
   - confidence too low/high → weights in `src/core/scoring.ts`
   - structured formats (phone/IBAN/card/IP/email) → `src/core/detectors/structured/`
   - **pure missing-name gap with no exploitable context → NOT your job:** open a
     `languages` issue and skip (rule 2).
4. **File the issue and label it.** Ensure the label exists, then create it with the
   gap evidence, the root cause, the *generalizing* fix, and the expected effect:
   ```bash
   gh label create self-improvement \
     --color 1d76db \
     --description "Automated coverage self-improvement (agent analyzing & improving)" || true
   # The routing path (rules 2/3) files `languages` issues — make sure that
   # label exists too, or gh issue create fails on a fresh repo.
   gh label create languages \
     --color 0e8a16 \
     --description "Name-database expansion handled by the /self-improve-languages loop" || true
   gh issue create --label self-improvement \
     --title "coverage: <short description>" \
     --body "<gap evidence, root cause, generalizing fix>"
   ```
5. **Implement the smallest generalizing fix** on a new branch (engine logic, scoring,
   or a context list — not name data).
6. **Lock it in with held-out regression tests.** Add to `bench/corpus.json` (never
   `bench/proven/`): positive cases using **values absent from the DB** that pass only
   via your heuristic, **and** negative guard cases proving precision. Add focused unit
   tests in the relevant `*.test.ts`.
7. **Run the full gate and confirm it is green:**
   ```bash
   npm ci
   npm run lint && npm run check && npm test
   npm run build:db && npm run bench
   ```
   Only run `npm run bench -- --update` if F1 genuinely improved and you justify it.
8. **Open the PR** (`fix:` / `feat:` — a heuristic change, never `data:`). Start the
   body with `Closes #<issue-number>` and include the gap evidence, root cause, the
   heuristic, the held-out proof, and before/after benchmark numbers. **PR only.**

If no gap admits a safe generalizing fix (only dictionary additions, or a change that
risks the proven suite / needs external resources), **do not force it**: file the
appropriate issue (`languages` for name gaps) describing the blocker and open no PR.
