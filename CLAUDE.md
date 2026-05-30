# CLAUDE.md

Guidance for agents working in this repo. This file holds the rules and the
conventions that the code follows but doesn't spell out elsewhere; for the
*design* read [`ARCHITECTURE.md`](ARCHITECTURE.md), for the *workflow* read
[`CONTRIBUTING.md`](CONTRIBUTING.md). Don't duplicate those here.

## Orientation

Browser-only, zero-knowledge PII detection & sanitization. `src/core` is a pure,
dependency-free `string → Span[]` library; the browser app, file readers, and
the optional local-LLM layer (`src/app`) are all built _around_ it. Keep that
boundary intact — `src/core` must not reach into the app or pull in runtime
dependencies.

## Hard rules

- **Zero-knowledge is sacred.** The engine makes no network calls. The only
  permitted outbound connection anywhere is the opt-in, _local_ Ollama on
  loopback. Never add telemetry, a backend, or a remote fetch to the engine.
- **Permissive name data only.** Names come from public-domain / permissively
  licensed sources (CC0, US Census, …). Record the source + license in the PR.
- **Additive / corrective only.** Never weaken an already-proven detection, and
  never edit `bench/proven/` — that suite is the locked record of proven
  behaviour and must keep passing exactly.
- **Green before push.** Run the full check sequence below; both benchmark gates
  (the proven suite and the F1 baseline) must hold.

## Build & check

`npm run build:db` is a prerequisite for `dev`, `build`, and `bench` — it
compiles the name packs the engine loads. Run it before anything that needs
PERSON detection.

Pre-PR sequence:

```bash
npm run lint && npm run check && npm test && npm run build:db && npm run bench
```

All scripts live in `package.json`; consult it rather than memorizing flags.

## Code conventions

- **TypeScript `strict`, ES modules, named exports.** No default exports, no
  implicit `any`; unused vars/params are errors (prefix with `_` to keep).
- **Detector contract.** A structured detector is a pure
  `(text: string) => Span[]` function, registered in the `STRUCTURED` map in
  `src/core/index.ts`. Every `Span` carries a `confidence` (0..1) and a `source`
  id, and all offsets are relative to the NFC-normalized text
  (`src/core/normalize.ts`) — never to the caller's raw input. A new structured
  type goes under `src/core/detectors/structured/` and into the `PiiType` union
  (and `ALL_PII_TYPES`) in `src/core/types.ts`.
- **Precision first.** Prefer a checksum or structural/cue gate over a loose
  regex; a low-confidence guess belongs below the confidence threshold, not in a
  broad pattern.
- **Comments explain _why_, not _what_.** Match the existing rationale density —
  e.g. `src/core/detectors/structured/iban.ts` documents why the pattern is
  loose and what gates it. Don't strip these when editing.
- **Formatting is Prettier-enforced** (single quotes, 100 cols, es5 commas). Run
  `npm run format:write`; don't hand-format.

## Testing conventions

- Unit tests are co-located as `*.test.ts` (Vitest `describe` / `it` / `expect`).
- **Prove generalization, not memorization.** Test with _held-out_ values — ones
  that aren't the specific case you're fixing — and say so in a comment, so the
  test demonstrates the heuristic generalizes. See
  `src/core/detectors/structured/structured.test.ts`.
- Add benchmark cases to `bench/corpus.json` (entities as `{ type, text }`) plus
  a focused unit test. Never add to `bench/proven/`.

## Where things go

`CONTRIBUTING.md` has the full "where things live" table — use it. Note that name
data lives in `scripts/build-db/sources.ts` (curated Latin `core` tier) and
`scripts/build-db/data/*.json` (ingested `ext` tier); `scripts/build-db/build.ts`
merges them into the Bloom packs.

## Deeper docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — pipeline, detectors, scoring, the
  name-database design.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup, where-things-live, PR style.
- [`docs/evaluation.md`](docs/evaluation.md) — metrics methodology and the CI
  gates.
- [`docs/self-improve.md`](docs/self-improve.md) — the automated self-improvement
  loop.
- `.claude/commands/` — the slash commands those workflows invoke.
