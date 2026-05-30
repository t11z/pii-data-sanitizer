# 🤖 Self-Improvement Loop

The detection engine improves over time through a **multi-layer** loop driven by
Claude Code. Each layer is a thin GitHub Actions workflow that does nothing but
invoke a **slash command** — so the exact same behaviour and guardrails run
whether a maintainer triggers it locally (`/self-improve-languages`) or it runs
on a schedule in CI.

## Layers

| Layer           | Slash command             | Workflow                                  | Purpose                                              |
| --------------- | ------------------------- | ----------------------------------------- | --------------------------------------------------- |
| 🌍 Expansion    | `/self-improve-languages` | `.github/workflows/self-improve-languages.yml` | **Dictionary breadth** — add new languages / names (additive only). |
| 🎯 Refinement   | `/self-improve-refine`    | `.github/workflows/self-improve-refine.yml`    | Fix current false positives / false negatives only. |
| 🔭 Discovery    | `/self-improve-coverage`  | `.github/workflows/self-improve-coverage.yml`  | **Heuristics** — probe daily for gaps, then ship a *generalizing* engine fix as an issue + PR. |

The command definitions live in `.claude/commands/`. The workflows reference
them via `prompt: '/self-improve-…'` and contain no logic of their own.

**Division of labor.** Discovery improves the *engine's heuristics* so it catches a
whole class of cases (including names it has never seen) — it does **not** add
individual names. Pure vocabulary growth is the Expansion loop's job. Discovery PRs
must prove generalization with **held-out values absent from the database**; a fix
that only works because a value is in the dictionary is memorization, not a heuristic,
and is routed to Expansion instead.

## The discovery loop (Haiku → sanitizer → Opus)

The expansion and refinement layers *react* to known cases. The discovery layer
runs **daily** (or on demand) to actively surface gaps the corpus doesn't cover yet:

1. **Generate (Haiku).** `/self-improve-coverage-generate` writes a synthetic,
   PII-dense **TAC case feed** — support tickets with TAC engineers and customer
   persons from European, Indian and Persian cultures, plus all six PII types — to
   `bench/self-improve/generated.json`, with ground-truth labels. **Synthetic data
   only**; nothing real is ever generated.
2. **Evaluate (deterministic).** `npm run bench:coverage`
   (`scripts/self-improve/evaluate-coverage.ts`) runs the real detector over the
   feed and writes a per-type gap report (`bench/self-improve/gaps.json`) listing
   the missed PII (false negatives) and over-detections (false positives).
3. **Analyze (Opus).** `/self-improve-coverage` reads the report, finds the
   root cause of the most important gap, files a GitHub **issue labeled
   `self-improvement`** (the label signals the agent is actively analyzing &
   improving), and opens a **PR** with the smallest *generalizing* heuristic fix
   (detector logic, scoring, or a context list — never a name dump) that `Closes`
   the issue.

The generated feed and gap report are **ephemeral discovery artifacts** —
git-ignored, never committed, and never part of CI gating. The fix's regression
cases use **held-out names absent from the database**, so they prove the heuristic
generalizes rather than memorizing the synthetic feed.

## Guardrails (apply to every layer)

1. **Additive or corrective — never re-invent.** A layer may add new data or fix
   a currently failing case. It may **not** rewrite, re-derive, or "refactor"
   detection that already works.
2. **The proven suite is locked.** `bench/proven/cases.json` is the record of
   already-proven behaviour. It must pass **exactly** (zero FP, zero FN) and may
   never be edited to make a change appear successful.
3. **No baseline regressions.** Overall F1 on `bench/corpus.json` must not drop
   below `bench/baseline.json`.
4. **PR-only.** Loops open pull requests for human review. **Nothing auto-merges.**
5. **Public, permissive data only.** Names come from public-domain / permissively
   licensed sources (recorded per pack). No user data — that would break the
   zero-knowledge guarantee.
6. **Offline engine.** All additions are compiled at build time; the browser
   engine makes no network calls. No fix may introduce server-side resources, a
   runtime backend/API, or an external/hosted LLM — gaps that would need any of
   those are written up and declined, not implemented.

## The gate

`npm run bench` enforces guardrails 2 and 3 and exits non-zero on violation. CI
also runs `npm run lint`, `npm run check`, `npm test`, and `npm run build`. A
self-improvement PR can only be merged once all of these are green.

## Case study: a real gap → fix cycle

The loop is not a demo — it ships. A worked example from the discovery layer
([PR #54](https://github.com/t11z/pii-data-sanitizer/pull/54)):

1. **Gap surfaced.** The daily synthetic feed included a SOC-style alert:
   `… unauthorized access from 2600:1700::/32 …`. The evaluator reported the IP both
   as a **false negative** (the full `2600:1700::/32` was missed) and a **false
   positive** (a truncated `2600:1700::` was emitted) — one span producing two errors.
2. **Root cause.** `IPV4_RE` / `IPV6_CANDIDATE_RE` in
   `src/core/detectors/structured/ip.ts` had no CIDR handling, so the match stopped at
   the address body and dropped the `/N` mask — even though CIDR is the canonical form
   in firewall, router, and SOC logs.
3. **Generalizing fix.** A shared `CIDR_SUFFIX` was appended to both regexes plus a
   `splitCidr()` helper that validates the prefix length against the family maximum
   (32 / 128). The rule is purely **structural** — no vocabulary, no dictionary — so it
   applies to every CIDR-tagged address, not just the one in the feed.
4. **Held-out proof + gate.** Regression cases used RFC documentation ranges
   (`198.51.100.0/24`, `2001:db8:1234::/48`) and zone-id forms (`fe80::1%eth0/64`), with
   negative guards for out-of-range masks. On the synthetic feed, IP F1 went **76.9% →
   92.3%** (recall 83.3% → 100%) while the corpus and proven gates stayed at 100%.

A second example ([PR #52](https://github.com/t11z/pii-data-sanitizer/pull/52)) traced a
lone credit-card false positive (`0000 0000 0000 0000`, which trivially passes Luhn) to a
missing MII check, and fixed it by rejecting `0`-prefixed PANs per ISO/IEC 7812 — again a
standards-grounded rule, not a memorized BIN list.

Both PRs are labeled `self-improvement` and were merged only after all gates were green.

## Setup

Add a `CLAUDE_CODE_OAUTH_TOKEN` repository secret for the scheduled workflows
(generate it locally with `claude setup-token`). Until it is set, the workflows
simply don't authenticate; a maintainer can also trigger them manually via
**workflow_dispatch** once the secret is configured.

The discovery workflow additionally needs `issues: write` permission (already set
in `self-improve-coverage.yml`) so it can create and label the issue. It reuses the
same `CLAUDE_CODE_OAUTH_TOKEN` — no extra secret is required.

## Security review

`security-review.yml` runs an AI security review modelled on
[`anthropics/claude-code-security-review`](https://github.com/anthropics/claude-code-security-review),
but driven through `anthropics/claude-code-action@v1` so it authenticates with the
**same `CLAUDE_CODE_OAUTH_TOKEN` secret** and bills against a Pro/Max subscription
instead of an Anthropic API key. (The official action only accepts an API key, set as
`ANTHROPIC_API_KEY`, which takes precedence over the OAuth token — so it cannot bill a
subscription without forking it.) The review logic lives in the `/security-review`
slash command (`.claude/commands/security-review.md`).

It runs on every pull request (commenting HIGH/MEDIUM findings on the PR) and weekly
on a schedule plus on-demand via **workflow_dispatch** (a full-repo scan that opens a
`security`-labeled issue only when there are findings). Like the self-improve
workflows it only comments / opens issues — it never edits code or merges. Secrets are
unavailable to workflows triggered by pull requests from forks, so fork PRs are not
reviewed automatically.
