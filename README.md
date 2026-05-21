# 🔒 PII Data Sanitizer

> Detect and remove personal data (PII) from text — **entirely in your browser**.
> Zero-knowledge by design: your text never leaves your device. No servers, no
> storage, no tracking.

[![CI](https://github.com/t11z/pii-data-sanitizer/actions/workflows/ci.yml/badge.svg)](https://github.com/t11z/pii-data-sanitizer/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Why

Pasting logs, support tickets, or documents into an LLM or a bug tracker often
leaks names, emails, IBANs, and more. This tool strips that out **before** the
text leaves your hands — and because it runs 100% client-side, the sanitizer
itself never sees your data on any server.

## 🛡️ Zero-knowledge

- All detection and replacement happens in the browser (in a Web Worker).
- No backend, no database, no analytics. Firebase is used **only** as a static
  CDN. A strict Content-Security-Policy blocks outbound connections.
- The name database ships as compact, read-only assets — nothing is uploaded.

## 🧠 How it works

A layered heuristic engine (`src/core`):

1. **Structured PII** — high-precision detectors with checksums:
   📧 email · 📞 phone · 🏦 IBAN (mod-97) · 💳 credit card (Luhn) · 🌐 IPv4/IPv6.
2. **Names** — a script-aware tokenizer + a multilingual name database
   (Bloom-filter packs) + **context** (titles, nobiliary/patronymic particles,
   capitalization, position) combined into a transparent **confidence score**.
   This catches complex names like `Kai-Uwe von Braun`, `Omar al Farouk`, or
   `David ben Gurion` while guarding against everyday words that happen to be
   names (`frank`, `rose`, `Berlin`).
3. **Resolution & sanitization** — overlaps are resolved by confidence, then
   matches are either 🏷️ **redacted** (`[EMAIL]`) or 🔁 **pseudonymized**
   (stable `[PERSON_1]`, structure-preserving — ideal for LLM input).

## 🌍 Languages (v1)

Latin-script European, plus transliterated **Indian, Arabic, Hebrew, Persian**
and transcribed **Chinese (Pinyin)** and **Japanese (Romaji)** names, plus a
native-script path for Arabic / Hebrew / Devanagari. Native CJK (no word
boundaries) is intentionally out of scope for v1. Coverage grows continuously
via the self-improvement loop. 🗺️

## 🚀 Quickstart

```bash
npm install
npm run build:db   # generate the name packs
npm run dev        # open the printed localhost URL
```

Other scripts:

```bash
npm test           # unit + edge-case tests (Vitest)
npm run bench      # precision/recall/F1 gate
npm run check      # type-check (svelte-check)
npm run lint       # ESLint
npm run build      # production build into dist/
npm run ingest     # refresh name data from Wikidata (CC0); network, build-time only
```

Name data comes from two committed sources, both permissively licensed: a curated
set of common names (`scripts/build-db/sources.ts`, the Latin **core** tier) and a
bulk sample ingested from **Wikidata (CC0)** (`scripts/build-db/data/`, the **ext**
tier + native scripts). `build:db` merges them into Bloom packs; the browser loads
the core eagerly, native scripts on demand, and the long tail in the background.

### Use the engine as a library

Structured PII (email, IBAN, …) works out of the box. **Name** detection needs a
name source — load Bloom packs with `PackLoader` (browser) or build one from the
source lists (Node/tests). Without a source, no PERSON matches are produced.

```ts
import { sanitize } from './src/core';
import { nameSourceFromSources } from './src/core/db/fromSources'; // tests/Node helper

const { text, mapping } = sanitize('Mail kai-uwe@example.com to Kai-Uwe von Braun.', {
  mode: 'pseudonymize',
  nameSource: nameSourceFromSources(),
});
// text:   "Mail [EMAIL_1] to [PERSON_1]."
// mapping: [{ placeholder: '[EMAIL_1]', original: 'kai-uwe@example.com', type: 'EMAIL' }, …]
```

In the browser the Web Worker loads packs automatically (Latin core eagerly,
native scripts on demand) — see `src/app/worker/sanitizer.worker.ts`.

## 🤖 Self-improving

A multi-layer loop (language **expansion** + accuracy **refinement**) runs Claude
Code on a schedule, opening PRs that add names or fix inaccuracies. It is strictly
**additive/corrective**, never touches already-proven detections, and everything
is gated by tests + a benchmark before a human merges. Both layers are also
available as slash commands (`/self-improve-languages`, `/self-improve-refine`).
See [`docs/self-improve.md`](docs/self-improve.md).

## 🤝 Contributing

**Contributions are very welcome!** This project gets better the more names,
languages, and edge cases the community brings.

- 🌍 **Add names / a language** → extend `src/core/db/embeddedData.ts` (or add a
  source in `scripts/build-db/build.ts`) using **permissively licensed** data.
- 🐛 **Fix a miss or false positive** → add a case to `bench/corpus.json` and a
  test, then make it green.
- 💡 **New PII type** → add a detector under `src/core/detectors/`.

Please run `npm test && npm run bench && npm run lint` before opening a PR. See
[CONTRIBUTING.md](CONTRIBUTING.md) for details. First-time contributors are
especially welcome — open an issue if you're unsure where to start. 💜

## ☁️ Deploying

Hosting is a static CDN (Firebase Hosting) and is **disabled by default** — there
is no public instance until a maintainer enables it. Workflows: `deploy.yml` (live
deploy on `main`) and `deploy-preview.yml` (per-PR preview channels).

Full setup (Firebase project, repo variables/secrets, going live) is in
[`docs/deployment.md`](docs/deployment.md).

## 📄 License

[MIT](LICENSE) © Thomas Sprock
