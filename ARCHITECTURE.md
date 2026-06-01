# Architecture

This document explains how the PII Data Sanitizer turns a blob of text into
sanitized output, entirely in the browser. It complements the code comments in
`src/core` — start here for the mental model, then read the files.

## Design goals

1. **Zero-knowledge.** Text never leaves the device. All detection runs in a Web
   Worker; a strict Content-Security-Policy blocks outbound connections (the only
   allowance is an opt-in, local Ollama on `localhost:11434`).
2. **High precision first.** A false positive that redacts a real word is annoying;
   a missed PII leak is dangerous — but a tool that cries wolf gets turned off. The
   engine leans on checksums and structural cues so that what it flags is almost
   always real, and exposes a confidence threshold for the rest.
3. **Transparent, not a black box.** Name confidence is an inspectable additive
   model (`src/core/scoring.ts`), so the self-improvement loop can reason about and
   tune individual signals.
4. **Pure core.** `src/core` is a pure, dependency-free string→spans library. The
   browser app, file readers, and the optional LLM layer are all built *around* it.

## The pipeline

```
            ┌──────────────────────────── src/core (pure) ────────────────────────────┐
 raw text ─▶│ normalize ─▶ detectors ─▶ confidence filter ─▶ resolveOverlaps ─▶ spans  │─▶ sanitize ─▶ text + mapping
            └───────────────────────────────────────────────────────────────────────┘
```

Entry points live in `src/core/index.ts`: `detect()` returns spans, `sanitize()`
detects and then replaces.

### 1. Normalize (`src/core/normalize.ts`)

All input is NFC-normalized first. Every offset produced downstream is relative to
this normalized text, which keeps the heuristic spans and any externally-supplied
spans (e.g. from the LLM layer) in the same coordinate system.

### 2. Detectors

**Structured detectors** (`src/core/detectors/structured/`) are high-precision and
checksum-gated where possible. Each is a `(text) => Span[]` function registered in
the `STRUCTURED` map in `index.ts`:

| Type          | Gate                                              | Confidence |
| ------------- | ------------------------------------------------- | ---------- |
| `EMAIL`       | Unicode-aware pattern + TLD shape                 | ~0.99      |
| `IBAN`        | ISO 7064 mod-97-10 checksum                       | ~0.97      |
| `CREDIT_CARD` | Luhn + ISO 7812 MII guard (no `0`-prefix)         | ~0.95      |
| `IP`          | RFC 4291 validation, IPv4/IPv6, CIDR suffix       | ~0.9       |
| `MAC`         | 6 octets, colon/dash separated                    | ~0.9       |
| `NATIONAL_ID` | US SSN allocation rules; German tax-ID ISO 7064   | ~0.9       |
| `PASSPORT`    | cue-gated ("Passport No …"), 6–9 alnum + a digit  | ~0.8       |
| `DATE_OF_BIRTH`| cue-gated ("DOB:", "born on", "Geburtsdatum")    | ~0.85      |
| `PHONE`       | 7–15 digits, guards against ISO dates / IDs       | ~0.6       |

Phone is deliberately low-confidence: bare digit runs are ambiguous, so it relies on
formatting/prefix signals and the confidence threshold rather than over-claiming.

Two detectors are **cue-gated** rather than checksum-gated: a passport number or a date
is only flagged when an explicit cue precedes it (e.g. `Passport No`, `DOB:`, `born on`,
`Geburtsdatum`). This keeps precision high in text full of incidental dates and codes —
a plain `2024-01-15` timestamp is not a date of birth unless the text says so. Where a
national ID's digit run overlaps a phone match, overlap resolution keeps the
higher-confidence ID.

**Name detection** (`src/core/detectors/names.ts`) is the sophisticated part:

- A **script-aware tokenizer** (`src/core/tokenize.ts`) classifies each token as
  Latin, Arabic, Hebrew, Devanagari, Bengali, Tamil, Han, or Hangul, strips
  possessive clitics, and is hyphenation-aware.
- Membership is tested against a **multilingual name database** of Bloom-filter packs
  (see below), with **diacritic folding for Latin only** (so "García" matches
  "garcia", while meaningful Arabic harakat / Hebrew niqqud are preserved).
- **Particle chains** stitch nobiliary/patronymic particles ("von der", "al-", "ben",
  "de la") across tokens, so `Kai-Uwe von Braun` and `David ben Gurion` are single
  spans.
- A **transparent additive confidence model** (`src/core/scoring.ts`) combines
  features — DB hits, number of parts, a preceding title/role, core-vs-ext tier,
  sentence-start position, single-token ambiguity — into a 0..1 score. Everyday words
  that happen to be names ("frank", "rose", "Berlin") are penalized down below the
  threshold.

Name detection then runs **multiple passes**, all in `index.ts`:

1. Direct detection over the text.
2. **Email-seeded:** derive candidate names from email local parts
   (`gmueller@…` → "müller") and re-scan, catching standalone later mentions
   (`src/core/identity/emailNames.ts`, `augmentedSource.ts`).
3. **Variants:** slug/handle spellings of an already-confirmed full name in URLs
   (`joost.vandenberg`), anchored to the full name for precision
   (`src/core/identity/nameVariants.ts`, `detectors/structured/urlNames.ts`).

### 3. Confidence filter

Every span below `minConfidence` (default 0.5) is dropped. Externally-produced
`extraSpans` (the optional LLM layer) are merged in here and subjected to the same
filter, so the core makes no special case for where a span came from.

### 4. Overlap resolution (`src/core/resolve.ts`)

`resolveOverlaps` ranks spans by (confidence desc, length desc, start asc) and greedily
keeps non-overlapping winners. This is why an email is never split into in-email name
fragments — the email span outranks them.

### 5. Sanitization & identity (`src/core/sanitize.ts`, `src/core/identity/`)

- **Redact** mode replaces each span with `[TYPE]`.
- **Pseudonymize** mode assigns stable, structure-preserving placeholders
  (`[PERSON_1]`, `[EMAIL_1]`). Partial mentions are folded onto the full name they
  corefer with (`identity/coref.ts`), and attributes that belong together (a person +
  their email/phone/IBAN on the same line) are grouped into an `Identity`
  (`identity/resolve.ts`).

## The name database (`src/core/db/`)

Names are stored as **Bloom filters** (`bloom.ts`) — `Uint8Array` bit arrays with
FNV-1a hashing, sized for a 1e-4 false-positive rate. This keeps ~201k names compact
and read-only; probabilistic false positives are harmless because the confidence
scorer still has to clear the threshold.

Two tiers:

- **core** — small curated sets of common names (a strong signal).
- **ext** — the long tail, bulk-ingested from permissively licensed sources (Wikidata
  CC0, US Census public-domain surnames). A lone ext-only token that is also ordinary
  vocabulary is penalized unless corroborated by a second name part, a title, or a role.

Packs are built offline by `scripts/build-db/build.ts` into `public/packs/`, with a
`packs.json` manifest. The browser loads the Latin core eagerly, native scripts on
demand, and the long tail in the background (`db/loader.ts`, `db/packSource.ts`).

## The app layer (`src/app/`)

- **Web Worker** (`worker/sanitizer.worker.ts`) runs all detection off the main thread
  and loads packs.
- **File readers** (`readers/`) parse `.txt/.csv/.json/.docx/.pdf` locally — DOCX via
  `fflate`, PDF via a bundled, same-origin pdf.js — so files never leave the device.
- **Optional Ollama layer** (`llm/`) is a two-phase, non-blocking recall boost against a
  *local* Ollama. It is off by default and only probed when the user opens the LLM
  panel. The model returns verbatim substrings + type; **its offsets are never trusted**
  — the app re-locates each substring in the normalized text and injects them as
  `extraSpans`. Any failure falls back cleanly to heuristics.

## Quality gates

- **Unit tests** (`*.test.ts`, Vitest) cover detectors, scoring, identity, readers, and
  the LLM client, using held-out values to prove generalization rather than memorization.
- **Benchmark** (`bench/run.ts`) enforces two gates on every PR: a locked **proven suite**
  that must pass exactly (zero FP/FN), and an **overall F1 baseline** on the corpus that
  must not regress. See [`docs/evaluation.md`](docs/evaluation.md).
- **Self-improvement loop** (`docs/self-improve.md`) proposes additive/corrective PRs
  behind these same gates.
