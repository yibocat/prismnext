---
name: experiment-to-methods
description: Use when writing or refreshing a Methods / Experiments section from logged runs, provenance, and result snapshots — Methods-grade receipts with no invented numbers.
license: MIT
---

# Experiment to Methods

Turn run receipts into a Methods section where every number traces to a run
id. The log is the source of truth — not memory, not the chat.

## When to use

- Drafting the Methods / Experiments section after runs finished
- Refreshing Methods after re-runs or new ablations
- Reviewer asked for implementation details you must ground

## Workflow

1. **Inventory** — `experiment-log` list, then read the relevant islands
   (meta + runs).
2. **Provenance** — `provenance-query` for the command and environment
   behind each artifact you cite.
3. **Numbers from receipts** — `results-snapshot` / run logs only. Every
   metric, seed, and hyperparameter must trace to a run id.
4. **Draft** —
   - Data / setup (splits, preprocessing as logged)
   - Implementation: runtime, key hyperparameters, hardware *from receipts*
   - Evaluation protocol and metrics with definitions
   - Report failed or negative runs when they shaped the conclusion
5. **Wire figures** — reference artifact paths (prefer run
   `artifactSnapshots` over mutable working copies).
6. **Verify** — `latex-compile` after edits; `citation-health` if
   references changed.

## Rules

- Never invent a metric, seed, command, or date — if it is not in a receipt,
  it does not go in the text.
- Mark gaps as TODO for the user instead of filling them plausibly.