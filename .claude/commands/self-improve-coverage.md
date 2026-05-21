---
description: Analyze the coverage-gap report, file a labeled GitHub issue with a concrete proposal, and open a PR with the smallest safe fix.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
argument-hint: "[optional: PII type or culture to focus on]"
---

# Self-Improvement — Coverage Analysis & Fix

You are the **analysis** step of the daily coverage-discovery loop. The previous
steps generated a synthetic, PII-dense TAC case feed and ran the real detector over
it. Your job: find the **root cause** of the most important coverage gap, file it as
a **GitHub issue**, and open a **PR** with the smallest safe fix.

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
2. **Correct/extend, don't re-invent.** Make the smallest change that closes the
   gap (add names, add a guard word, tune a weight, extend a regex). Do **not**
   rewrite working detectors or scoring. The `bench/proven/` suite is the locked
   record of proven behavior — it must keep passing **exactly** and you must never
   edit those cases.
3. **No regressions.** `npm test`, the proven suite, and the baseline F1 must all
   stay green. A fix that helps one case but hurts another is not acceptable.
4. **Offline-only — no server-side resources, no external LLMs.** Every fix must
   keep the detection engine 100% client-side and offline. Allowed: static data
   compiled at build time (e.g. names in `scripts/build-db/sources.ts` → Bloom
   packs) and pure local heuristics (regex / guard words / scoring). **Forbidden:**
   any proposal that needs a backend, a network/API call at engine runtime, or an
   external/hosted model. If a gap could only be closed that way, say so in the
   issue and **decline** it — do not implement it. (See `CONTRIBUTING.md`:
   "Zero-knowledge stays sacred… no network calls from the engine.")
5. **Public, permissive data only.** New names must come from public-domain /
   permissively licensed sources, recorded per pack.
6. **Issue + PR only — never merge, never push to `main`.**

## Steps

1. **Read the report.** `cat bench/self-improve/gaps.json`. If there are no
   meaningful false negatives/positives, stop. Otherwise pick the **single
   highest-impact** root cause (often a `PERSON` culture gap — e.g. missing
   Persian/Indian names — or a structured-format miss). Use the argument as a focus
   hint if provided.
2. **Avoid duplicates.** Check for an already-open self-improvement issue:
   ```bash
   gh issue list --label self-improvement --state open
   ```
   If one already covers this gap, add a brief comment with the new evidence and
   **stop** rather than stacking a duplicate issue/PR.
3. **Trace the root cause** to the responsible code/data:
   - missing names → `scripts/build-db/sources.ts`
   - over-detection / ambiguous words → `src/core/context/commonWords.ts`
   - scoring weights → `src/core/scoring.ts`
   - structured formats (phone/IBAN/card/IP/email) → `src/core/detectors/structured/`
4. **File the issue and label it.** Ensure the label exists, then create the issue
   describing the gap (with concrete examples from `gaps.json`), the root cause, the
   proposed fix, and the expected before/after effect:
   ```bash
   gh label create self-improvement \
     --color 1d76db \
     --description "Automated coverage self-improvement (agent analyzing & improving)" || true
   gh issue create --label self-improvement \
     --title "coverage: <short description>" \
     --body "<gap evidence, root cause, proposed fix>"
   ```
   The `self-improvement` label signals that the agent is actively analyzing and
   improving this gap.
5. **Implement the smallest safe fix** on a new branch. Prefer additive data and
   guard changes over structural edits.
6. **Lock the fix in as a regression test.** Add the previously-missed (minimized,
   deterministic) case(s) to `bench/corpus.json` so the gap can never silently
   reappear. **Do not** touch `bench/proven/`.
7. **Run the full gate and confirm it is green:**
   ```bash
   npm ci
   npm run lint && npm run check && npm test
   npm run build:db && npm run bench
   ```
   If overall F1 improved and you intend the gain to be the new floor, run
   `npm run bench -- --update` and justify it in the PR.
8. **Open the PR** (`fix: …` for behavior, `data: …` for name additions). Start the
   body with `Closes #<issue-number>` and include the gap evidence, root cause, the
   fix, and before/after benchmark numbers. **PR only — never merge.**

If the smallest viable fix would require a large structural change, risks the proven
suite, or would need server-side/external resources, **do not force it**: file the
issue describing the blocker and open no PR (or a draft that explains why).
