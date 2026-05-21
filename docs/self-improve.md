# 🤖 Self-Improvement Loop

The detection engine improves over time through a **multi-layer** loop driven by
Claude Code. Each layer is a thin GitHub Actions workflow that does nothing but
invoke a **slash command** — so the exact same behaviour and guardrails run
whether a maintainer triggers it locally (`/self-improve-languages`) or it runs
on a schedule in CI.

## Layers

| Layer           | Slash command             | Workflow                                  | Purpose                                              |
| --------------- | ------------------------- | ----------------------------------------- | --------------------------------------------------- |
| 🌍 Expansion    | `/self-improve-languages` | `.github/workflows/self-improve-languages.yml` | Add new languages / new names (additive only).      |
| 🎯 Refinement   | `/self-improve-refine`    | `.github/workflows/self-improve-refine.yml`    | Fix current false positives / false negatives only. |
| 🔭 Discovery    | `/self-improve-coverage`  | `.github/workflows/self-improve-coverage.yml`  | Probe daily for unknown coverage gaps, then file an issue + fix PR. |

The command definitions live in `.claude/commands/`. The workflows reference
them via `prompt: '/self-improve-…'` and contain no logic of their own.

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
   improving), and opens a **PR** with the smallest safe fix that `Closes` the issue.

The generated feed and gap report are **ephemeral discovery artifacts** —
git-ignored, never committed, and never part of CI gating. Only a human-reviewed,
minimized case from a real gap lands in `bench/corpus.json` as a permanent
regression test.

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

## Setup

Add a `CLAUDE_CODE_OAUTH_TOKEN` repository secret for the scheduled workflows
(generate it locally with `claude setup-token`). Until it is set, the workflows
simply don't authenticate; a maintainer can also trigger them manually via
**workflow_dispatch** once the secret is configured.

The discovery workflow additionally needs `issues: write` permission (already set
in `self-improve-coverage.yml`) so it can create and label the issue. It reuses the
same `CLAUDE_CODE_OAUTH_TOKEN` — no extra secret is required.
