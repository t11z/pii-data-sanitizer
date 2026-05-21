---
description: Generate a synthetic, PII-dense TAC case feed (with ground-truth labels) to probe the sanitizer for coverage gaps.
allowed-tools: Write, Read
argument-hint: "[optional: culture/region or PII type to emphasize]"
---

# Self-Improvement — Coverage Probe (Generation)

You are the **generation** step of the daily coverage-discovery loop. Your only job
is to write a fresh batch of realistic, **synthetic** input that stress-tests the
PII detector, together with the **ground truth** of what should be detected. You do
**not** analyze results, change code, or open PRs.

## What to produce

Write a **TAC (Technical Assistance Center) case feed** — a sequence of short
support-case entries that read like a real ticket stream: case headers, engineer
notes, customer replies, escalation updates.

- **~15–25 entries.** Keep each `text` to one or a few sentences.
- **People from many cultures.** Include TAC **engineers** and **customer** persons
  whose names come from **European, Indian and Persian** cultures (plus a few
  others). Use realistic, sometimes tricky forms: hyphenated names, particles
  (`von`, `de`, `al-`), transliterations, titles (`Dr.`, `Eng.`), and full names
  embedded in running prose — not just isolated tokens.
- **All six PII types, densely.** Embed `EMAIL`, `PHONE`, `IBAN`, `CREDIT_CARD`,
  `IP`, and `PERSON`, including awkward but valid formats: international phone
  groupings, spaced IBANs and card numbers, IPv6 addresses, plus a few near-miss
  **decoys** (order numbers, version strings) that should **not** be flagged.
- If an argument is given, bias the feed toward that culture/region or PII type.

## Hard rules (do not violate)

1. **Fully synthetic / fake data only.** Invent every name, address, number, and
   identifier. Never use a real person, a real account/card number, or any data
   that could identify someone. IBANs/cards may follow valid checksums but must be
   fabricated test values.
2. **Ground truth must be exact.** For every case, list each PII substring exactly
   as it appears in `text` (same casing, spacing, punctuation) so the evaluator can
   match it.
3. **Generate only.** Do not run the sanitizer, edit source, commit, branch, or
   open a PR. Write the one file and stop.

## Output

Write **strict JSON** (no comments, no trailing text) to
`bench/self-improve/generated.json` as an array of cases:

```json
[
  {
    "text": "TAC #4471 — Eng. Darioush Esfahani emailed customer Anjali Sharma at anjali.sharma@example.in; refund to IBAN DE89 3704 0044 0532 0130 00.",
    "entities": [
      { "type": "PERSON", "text": "Darioush Esfahani" },
      { "type": "PERSON", "text": "Anjali Sharma" },
      { "type": "EMAIL", "text": "anjali.sharma@example.in" },
      { "type": "IBAN", "text": "DE89 3704 0044 0532 0130 00" }
    ]
  }
]
```

`type` must be one of `EMAIL`, `PHONE`, `IBAN`, `CREDIT_CARD`, `IP`, `PERSON`.
Cases with no PII (pure decoys) may use `"entities": []`.
