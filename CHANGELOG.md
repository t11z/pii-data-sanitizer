# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases ship a prebuilt, static bundle on the
[GitHub Releases page](https://github.com/t11z/pii-data-sanitizer/releases).

## [2.1.0] — 2026-05-29

### Added
- **Three new PII types**, all gated for precision (no new false positives on the corpus,
  proven suite still exact):
  - `NATIONAL_ID` — US Social Security Numbers (dashed form, validated against the SSA
    area/group/serial allocation rules) and German tax IDs (Steuer-IdNr, validated by the
    BZSt structural rule + ISO 7064 MOD 11,10 check digit).
  - `PASSPORT` — cue-gated (e.g. after "Passport No" / "Reisepass"): a 6–9 character
    uppercase alphanumeric number containing at least one digit.
  - `DATE_OF_BIRTH` — cue-gated (e.g. "DOB:", "born on", "Geburtsdatum"), so incidental
    dates/timestamps are not flagged. Supports ISO, numeric, and English/German
    month-name date formats.
- `CHANGELOG.md` and a prominent live-demo link + release badge in the README, plus
  `ARCHITECTURE.md`, evaluation/comparison docs, and a generated metrics snapshot.

## [2.0.0] — 2026-05-29

### Added
- **Optional local Ollama LLM second layer** (recall boost). Off by default and only
  surfaced once a reachable local Ollama is detected; the deterministic engine remains
  the default and works fully offline. LLM offsets are never trusted — the model returns
  verbatim substrings that are re-located in the normalized text — and any failure falls
  back cleanly to heuristics. No cloud providers, to preserve the zero-knowledge story.
  (#55)
- Detector-agnostic `extraSpans` injection point in `DetectOptions`, so externally
  produced spans (e.g. the LLM layer) pass through the same confidence filter and overlap
  resolution as heuristic spans; `src/core` stays pure and offline.

## [1.0.1] — 2026-05-29

### Fixed
- **IPv4/IPv6 CIDR suffix** (`/N`) is now captured as part of the address span, validated
  to RFC-correct prefix ranges. (#54)
- **Credit card**: reject `0`-prefixed Luhn-valid PANs per ISO/IEC 7812 MII 0 (no consumer
  payment network issues them), removing an all-zeros false positive. (#52)
- **IBAN**: allow a space between the country code and check digits (the common print
  style on invoices), still gated by the mod-97 checksum. (#50)
- **Names**: suppress chains that start or extend onto a digit-adjacent identifier prefix
  (e.g. `IBAN CZ6508…`), a structural cue that a token is part of an identifier, not a
  name. (#48)

## [1.0.0] — 2026-05-26

Initial public release of the browser-only, zero-knowledge PII sanitizer.

### Added
- **Layered heuristic engine** (`src/core`): high-precision structured detectors with
  checksums (email, phone, IBAN mod-97, credit-card Luhn, IPv4/IPv6, MAC) plus a
  script-aware, context-scored multilingual **name** detector with a transparent additive
  confidence model.
- **Multilingual name database** as compact, read-only Bloom-filter packs (core + ext
  tiers), built from permissively licensed sources (project-curated + Wikidata CC0 + US
  Census public-domain surnames). Latin, Arabic, Hebrew, Devanagari, and Hangul scripts.
- **Hangul script + scaled coverage** for Korean, Vietnamese, and sub-Saharan African
  names, with a relevance-gated language self-improvement workflow. (#43)
- **Identity resolution & pseudonymization**: stable, structure-preserving placeholders
  (`[PERSON_1]`), coreference of partial mentions, and slug/handle name-variant detection
  in URLs. (#42)
- **In-browser file ingestion** for `.txt`, `.csv`, `.json`, `.docx`, and `.pdf` — DOCX
  unzipped with `fflate`, PDFs decoded via a bundled, same-origin pdf.js, so files never
  leave the device. (#44)
- **Manual correction UI**: select-to-redact, false-positive toggles, and manual
  false-negative entries, all in-memory. (#45)
- **Zero-knowledge hardening**: all detection in a Web Worker, a strict
  Content-Security-Policy blocking outbound connections, no backend/analytics.
- **Release workflow** that publishes a fully static bundle (`.zip` + `.tar.gz` + SHA256)
  so the app runs locally without Node/npm. (#46)
- **Self-improvement loop**: scheduled Claude Code workflows (coverage probe → gap
  analysis → generalizing fix PR; language expansion; refinement), strictly
  additive/corrective and gated by tests + the benchmark before any human merge.

[2.1.0]: https://github.com/t11z/pii-data-sanitizer/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/t11z/pii-data-sanitizer/compare/v1.0.1...v2.0.0
[1.0.1]: https://github.com/t11z/pii-data-sanitizer/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/t11z/pii-data-sanitizer/releases/tag/v1.0.0
