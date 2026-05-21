# 🤝 Contributing

Thanks for helping make the PII Data Sanitizer better! Every name, language, and
edge case helps protect someone's privacy. 💜

## Ground rules

- 🔒 **Zero-knowledge stays sacred.** No backend, no analytics, no network calls
  from the engine. Everything runs in the browser.
- ⚖️ **Permissive data only.** Only contribute name data from public-domain or
  permissively licensed sources (e.g. CC0). Note the source + license in your PR.
- ✅ **Green before you push.** Run the checks below.

## Dev setup

```bash
npm install
npm run build:db
npm run dev
```

## Checks (run before opening a PR)

```bash
npm run lint
npm run check
npm test
npm run build:db && npm run bench
```

The benchmark enforces two gates: the **proven suite** (`bench/proven`) must pass
exactly, and overall **F1** must not drop below `bench/baseline.json`. If you
intentionally raise the bar, update the baseline with `npm run bench -- --update`
and explain why.

## Where things live

| You want to…              | Edit…                                              |
| ------------------------- | -------------------------------------------------- |
| Add names / a language    | `src/core/db/embeddedData.ts`, `scripts/build-db/` |
| Add titles / particles    | `src/core/context/`                                |
| Reduce false positives    | `src/core/context/commonWords.ts`, `scoring.ts`    |
| Add a structured PII type | `src/core/detectors/structured/`                   |
| Add test cases            | `src/core/**/*.test.ts`, `bench/corpus.json`       |

## Adding test cases

Prefer adding to `bench/corpus.json` (entities as `{ type, text }`) plus a focused
unit test. Don't edit `bench/proven/` — that suite is the locked record of
already-proven behaviour.

## Commit / PR style

- Small, focused PRs.
- Describe the *why*. Include before/after benchmark numbers for engine changes.
- Be kind in reviews. We're all here to protect privacy. 🙂
