---
name: experiment-to-methods
description: Use when writing or refreshing a Methods / Experiments section from logged runs, provenance, and result snapshots — or when auditing an existing section to check every number still traces to a run. Methods-grade receipts with no invented numbers.
license: MIT
---

# Experiment to Methods

Turn run receipts into a Methods section where every number traces to a run
id. The log is the source of truth — not memory, not the chat.

The discipline is strict about **numbers** (no receipt, no text) and relaxed
about **prose** (structure and level of detail are the user's call).

## When to use

- Drafting the Methods / Experiments section after runs finished
- Refreshing Methods after re-runs or new ablations
- Auditing an existing section: does every number still trace to a run?
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
5. **Traceability convention** — anchor each quantitative paragraph with a
   LaTeX comment carrying the run ids, e.g. `% runs: <island>/<run-id>, …`.
   Invisible in the PDF; lets anyone re-trace a number without hunting.
6. **Wire figures** — reference artifact paths (prefer run
   `artifactSnapshots` over mutable working copies).
7. **Verify** — `latex-compile` after edits; `citation-health` if
   references changed.

## Refreshing an existing section

- **Patch, don't regenerate** — re-run only the numbers whose underlying
  runs changed; keep the user's prose edits intact.
- **Drift check** — when a re-run changes a number already in the text,
  flag every occurrence (abstract, tables, claims), not just the Methods
  paragraph. Say what moved and from where to where.
- Large-scale claim rewrites after contradictory re-runs belong with the
  user first — propose, then edit.

## Done when

- Every quantitative claim in the section traces to a run id (via the
  `% runs:` anchors).
- Every gap is a visible TODO assigned to the user — nothing plausibly
  filled.
- `latex-compile` passes; figures point at artifact snapshots.
- After a refresh: drifted numbers flagged everywhere they appear.

## Rules

- Never invent a metric, seed, command, or date — if it is not in a receipt,
  it does not go in the text.
- Mark gaps as TODO for the user instead of filling them plausibly.
