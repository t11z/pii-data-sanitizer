---
description: Additively expand the name database with new languages / new names from public, permissively licensed sources.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
argument-hint: "[optional: language or region to focus on]"
---

# Self-Improvement — Language & Name Expansion

You are extending the PII Data Sanitizer's name coverage. This is the **expansion**
layer of the self-improvement loop. Work **additively only**.

## Hard rules (do not violate)

1. **Additive only.** You may add new given/family names, new particles, titles,
   or a new language/script source. You may **not** rewrite, re-derive, or
   "refactor" detection logic that already passes. The locked suite in
   `bench/proven/` is proof of working behavior — never edit those cases or the
   engine in a way that changes their results.
2. **Public, permissive data only.** Ingest names only from public-domain /
   permissively licensed datasets (e.g. CC0 Wikidata, open census lists). Record
   the source and license for every addition. Never use user-submitted or
   scraped private data — that would break the zero-knowledge promise.
3. **No network calls in the engine.** Additions are static data compiled at
   build time; the browser engine must remain offline.
4. **PR only.** Never push to `main`. Open a pull request for human review.

## Steps

1. Pick a target (use the argument if given, else the largest current coverage
   gap). Inspect existing data in `src/core/db/embeddedData.ts` and the build
   sources in `scripts/build-db/build.ts`.
2. Add new names to the appropriate source list (and, for a new language, add a
   new `SOURCES` entry with its `license`). Keep entries lowercased and deduped.
3. Add a few **new** labeled cases to `bench/corpus.json` that exercise the new
   coverage (do not touch `bench/proven/`).
4. Run the full gate locally and ensure it is green:
   ```bash
   npm ci
   npm run lint && npm run check && npm test
   npm run build:db && npm run bench
   ```
5. If — and only if — metrics improved or held and you intend the gain to be the
   new floor, refresh the baseline with `npm run bench -- --update` and explain
   why in the PR.
6. Open a PR titled `data: expand <language/region> name coverage` summarizing
   what was added, the data source + license, and the before/after benchmark
   numbers.

If you cannot find permissively licensed data or the gate regresses, stop and
open no PR (or open a draft explaining the blocker).
