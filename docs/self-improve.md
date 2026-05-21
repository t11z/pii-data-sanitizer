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

The command definitions live in `.claude/commands/`. The workflows reference
them via `prompt: '/self-improve-…'` and contain no logic of their own.

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
   engine makes no network calls.

## The gate

`npm run bench` enforces guardrails 2 and 3 and exits non-zero on violation. CI
also runs `npm run lint`, `npm run check`, `npm test`, and `npm run build`. A
self-improvement PR can only be merged once all of these are green.

## Setup

Add an `ANTHROPIC_API_KEY` repository secret for the scheduled workflows. Until
then they can still be run manually via **workflow_dispatch** by a maintainer
with the key configured.
