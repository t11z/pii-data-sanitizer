---
description: Additively expand the name database with new languages / new names from public, permissively licensed sources.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
argument-hint: "[optional: language or region to focus on]"
---

# Self-Improvement — Language & Name Expansion

You are extending the PII Data Sanitizer's name coverage. This is the **expansion**
layer of the self-improvement loop. Work **additively only**, and work at **scale** —
a handful of hand-typed names is noise, not coverage (see the relevance gate below).

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
5. **Relevance gate — ≥ 1000 net-new names, or no PR.** An expansion must add at
   least **1000 net-new unique names** (after dedupe against the existing
   database). A 20- or 100-name tweak is noise and **must not** become a PR. If
   you cannot clear 1000, do not hand-curate to pad the number — fix the
   *ingestion* (rule below) or stop and open no PR (or a draft explaining the
   blocker). See "Measuring net-new" for how to count.

## Strategy — scale the ingestion, don't hand-curate

The lever for real coverage is the **ingestion pipeline**
(`scripts/build-db/ingest.ts`), not pinning individual strings into
`scripts/build-db/sources.ts`. Hand-curation is reserved for small, targeted,
high-frequency fixes that ingestion cannot produce (e.g. conventional surname
romanizations). Think strategically and optimize for large, well-licensed
datasets:

- **Find the biggest gap first.** Probe the committed DB
  (`nameSourceFromBuildInputs()`), pick a region/language family that is sparse
  or absent, and target it deliberately.
- **Extend the harvest.** The reliable, cheap lever is the country-constrained
  Wikidata query (`HUMAN_BY_COUNTRY` in `ingest.ts`): people by nationality
  (`P27`) × label language. Add new `[countryQID, lang]` pairs to pull native and
  romanized labels at scale (a bare `Q5 + native-label` query times out — always
  constrain by country). For a brand-new script, add it to `CAPS`, add a
  `detectScript` pattern (`src/core/tokenize.ts`), the `Script` union
  (`src/core/types.ts`), and `isCaselessNameScript` (`src/core/detectors/names.ts`).
- **Transliterate for dual coverage.** Store native-script names in their own
  pack **and** a romanized form in the Latin pack so romanized text also matches.
  Korean Hangul is self-transliterated via `scripts/build-db/romanize-hangul.ts`
  (Revised Romanization + a curated surname-override map, since 김→Kim, 이→Lee do
  not follow RR). Vietnamese (and accented African/Latin names) get an
  ASCII-folded variant via `asciiFold` (Nguyễn → nguyen). Add to these tables
  rather than hand-listing romanizations.

## Recommended data sources (all CC0 / public domain)

- **Wikidata SPARQL, country-constrained** (`P27` + label language) — the primary
  lever, already wired in `ingest.ts`. Covers Korea (`Q884`: ko/en), Vietnam
  (`Q881`: vi/en), and sub-Saharan Africa (Nigeria `Q1033`: yo/ig/ha; Ghana
  `Q117`: ak/tw/ee; Kenya/Tanzania/Uganda: sw; South Africa `Q258`: zu/xh/af;
  Ethiopia `Q115`: am; etc.). Most relevant African and Vietnamese names are
  Latin script; Korean is Hangul (transliterated at ingest).
- **Wikidata given/family name items** (`Q202444`/`Q101352` etc.) for languages
  whose name items are well-populated.
- **Open census / official statistics name-frequency lists** (public domain),
  following the `scripts/build-db/ingest-census.ts` pattern (US Census surnames).
- **Do NOT** scrape proprietary or private sources — that breaks the
  zero-knowledge promise. Record source + license for every addition.

## Steps

1. **Pick a high-impact target** (use the argument if given, else the largest
   coverage gap). Inspect `scripts/build-db/sources.ts` and the ingested data
   under `scripts/build-db/data/`.
2. **Record the baseline name count** so you can prove the gate later:
   ```bash
   npm run build:db
   node -e "const m=require('./public/packs/packs.json');console.log(m.packs.reduce((t,p)=>t+p.count,0))"
   ```
3. **Grow coverage at scale**, preferring ingestion:
   - extend `scripts/build-db/ingest.ts` (new `HUMAN_BY_COUNTRY` pairs, a new
     script + transliteration) and run `npm run ingest` to refresh the committed
     Wikidata (CC0) data files, and/or
   - only for targeted high-frequency gaps, add curated names to
     `scripts/build-db/sources.ts` (Latin = core tier; new native scripts get
     their own `SOURCES` entry with a `license`).
   Keep entries lowercased and deduped. Only use permissively licensed data.
4. **Measuring net-new — enforce the ≥1000 gate.** Rebuild and re-count; the gate
   is the delta (build dedupes, so the difference is unique net-new names):
   ```bash
   npm run build:db
   node -e "const m=require('./public/packs/packs.json');console.log(m.packs.reduce((t,p)=>t+p.count,0))"
   ```
   `after − before` must be **≥ 1000**. If not, do not open a PR.
5. **Add a few new labeled cases** to `bench/corpus.json` exercising the new
   coverage — native script **and** romanized forms (do not touch `bench/proven/`).
6. **Run the full gate locally and ensure it is green:**
   ```bash
   npm ci
   npm run lint && npm run check && npm test
   npm run build:db && npm run bench
   ```
7. If — and only if — metrics improved or held and you intend the gain to be the
   new floor, refresh the baseline with `npm run bench -- --update` and explain
   why in the PR.
8. **Open a PR** titled `data: expand <language/region> name coverage` summarizing
   what was added, the data source + license, the **net-new name count
   (before → after)** proving the ≥1000 gate, and the before/after benchmark
   numbers.

If you cannot find permissively licensed data, cannot clear the 1000-name gate,
or the gate regresses, **stop and open no PR** (or open a draft explaining the
blocker). No noise PRs.
