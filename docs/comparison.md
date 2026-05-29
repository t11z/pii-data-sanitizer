# Comparison with Microsoft Presidio

[Microsoft Presidio](https://github.com/microsoft/presidio) is a widely used,
open-source PII detection/anonymization SDK (regex recognizers + a spaCy NER model).
It is a useful reference point: a mature, general-purpose tool to compare this
project's heuristic engine against.

`scripts/eval/compare_presidio.py` runs Presidio over the **same** `bench/corpus.json`,
slices each detected span out of the text, maps Presidio's labels onto this project's
`PiiType`s, and scores it with the **same** strict, span-level `(type, text)` metric used
by `bench/run.ts`.

## ⚠️ Read this first — the comparison is not neutral

`bench/corpus.json` is **this project's regression gate**, hand-curated alongside its
heuristics. By construction this engine scores ~100% on it. Presidio has never seen this
corpus and is not tuned for it, so the absolute gap **overstates** a real-world quality
difference. Treat the numbers as **"where do the two approaches diverge on these texts,"
not "X is N% better than Y."** A neutral benchmark would require a third-party, held-out
corpus neither tool was built against (tracked as future work in
[`evaluation.md`](evaluation.md)).

With that caveat stated plainly, the comparison is still informative about the *kinds* of
differences between a checksum-and-context heuristic engine and a general regex+NER tool.

## Results

Scored on the intersection of types both tools can produce (`CREDIT_CARD, EMAIL, IBAN,
IP, PERSON, PHONE`; MAC is excluded as Presidio has no built-in MAC recognizer). Full
generated table in [`comparison-report.md`](comparison-report.md); regenerate with
`python scripts/eval/compare_presidio.py --write` (model: `en_core_web_lg`).

| Type        | This engine F1 | Presidio F1 |
| ----------- | -------------- | ----------- |
| CREDIT_CARD | 100.0%         | 100.0%      |
| EMAIL       | 100.0%         | 100.0%      |
| IBAN        | 100.0%         | 40.0%       |
| IP          | 100.0%         | 28.6%       |
| PERSON      | 100.0%         | 76.2%       |
| PHONE       | 100.0%         | 44.4%       |
| **Overall** | **100.0%**     | **67.9%**   |

## How to read it

- **Email / credit card**: both perfect — these are unambiguous, checksum/format-defined,
  and both tools nail them.
- **IBAN**: Presidio misses spaced/printed IBAN formats present in the corpus (recall
  25%). This project added explicit handling for the common print styles (e.g. a space
  after the country code) behind the mod-97 checksum.
- **IP**: Presidio's recall and precision are both low here — it over-flags version-number
  and dotted-decimal shapes and under-detects IPv6/CIDR forms, where this engine validates
  against RFC 4291 and captures the CIDR suffix as one span.
- **Phone**: Presidio detects the numbers (recall 100%) but also over-flags other digit
  runs (precision ~29%). This project keeps phone confidence deliberately low and guards
  against ISO dates / identifiers, trading some recall for precision.
- **Person**: the corpus is multilingual (transliterated Arabic/Hebrew/Indic, particle
  chains). Presidio's English NER misses many of these and splits some particle names;
  this project's script-aware, database-backed detector is built for exactly that.

The takeaway is not a leaderboard number but a **profile**: this engine trades generality
for precision on structured types and for multilingual, particle-aware name handling — at
the cost of needing a curated corpus and a name database, and of the honest caveat above
about what a 100% gate score does (and does not) mean.
