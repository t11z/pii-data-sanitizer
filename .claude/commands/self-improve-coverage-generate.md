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
- **All ten PII types.** Densely embed the six classic types — `EMAIL`, `PHONE`,
  `IBAN`, `CREDIT_CARD`, `IP`, and `PERSON` — including awkward but valid formats:
  international phone groupings, spaced IBANs and card numbers, IPv6 addresses.
  Card numbers and IBANs must satisfy their checksums (Luhn, mod-97): the detector
  validates them, so a checksum-invalid value is a decoy by design, not PII.
- **Sprinkle in the four network/document types** — at least 2–3 instances each of
  `MAC`, `NATIONAL_ID`, `PASSPORT`, and `DATE_OF_BIRTH` — shaped so the detector's
  precision gates can legitimately fire (mislabeled ground truth here produces
  phantom gaps that waste the analysis run):
  - `MAC`: separator forms only — `aa:bb:cc:dd:ee:ff`, `aa-bb-cc-dd-ee-ff`, or
    Cisco `aabb.ccdd.eeff`. A bare 12-hex run is intentionally not detected; use
    those as unlabeled decoys.
  - `NATIONAL_ID`: prefer dashed US SSNs with a valid allocation (area not
    `000`/`666`/`9xx`, group not `00`, serial not `0000`), standing alone — never
    a slice of a longer dashed number. German tax IDs only if genuinely ISO
    7064-valid; do not fabricate arbitrary 11-digit runs and label them.
  - `PASSPORT`: an explicit cue (`Passport No.`, `Reisepass`, `Passnummer`)
    followed by a 6–9 character uppercase alphanumeric containing at least one
    digit. Label **only the value**, never the cue.
  - `DATE_OF_BIRTH`: a birth cue (`DOB:`, `born on`, `Geburtsdatum`) directly
    before the date. Label **only the date**. Plain dates (timestamps, SLAs,
    expiry dates) are decoys — never label them.
- **Decoys.** Include a few near-miss values that should **not** be flagged:
  order numbers, version strings, bare 12-hex runs, cue-less dates,
  checksum-invalid card numbers.
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
  },
  {
    "text": "Switch port maps to MAC 00:1A:2B:3C:4D:5E; identity confirmed via DOB: 1987-03-14 (firmware 2024.11.02 unaffected).",
    "entities": [
      { "type": "MAC", "text": "00:1A:2B:3C:4D:5E" },
      { "type": "DATE_OF_BIRTH", "text": "1987-03-14" }
    ]
  }
]
```

Note how the second case labels only the date after the `DOB:` cue — the cue
stays outside the span — and leaves the firmware version unlabeled as a decoy.

`type` must be one of `EMAIL`, `PHONE`, `IBAN`, `CREDIT_CARD`, `IP`, `MAC`,
`NATIONAL_ID`, `PASSPORT`, `DATE_OF_BIRTH`, `PERSON`.
Cases with no PII (pure decoys) may use `"entities": []`.
