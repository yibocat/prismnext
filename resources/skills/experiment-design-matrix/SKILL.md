---
name: experiment-design-matrix
description: Use when planning experiments, ablations, or evaluation matrices before running anything — factors and levels, fair baselines, controls, metrics, seeds, and stopping criteria as a design doc.
license: MIT
---

# Experiment Design Matrix

Design before looping runs. Produce a design doc that makes every later run
interpretable — then scaffold the island and execute cheap-first.

## When to use

- Planning a new experiment, ablation study, or evaluation sweep
- Turning a hypothesis into a concrete factor matrix
- The user is about to run ad-hoc scripts with no design record

## Workflow

1. **Anchor** — `research-brief-read` to name the claim this matrix tests
   (optional, never a gate).
2. **Write the design doc** (into the island or project notes) —
   - Question being answered
   - Factors × levels (independent variables)
   - Baselines and controls — and why each comparison is *fair*
   - Metrics with precise definitions
   - Seeds / repeats
   - Stopping criteria
   - Artifact paths that must survive
3. **Cheap-first order** — smoke test → single matrix cell → full sweep.
4. **Scaffold** — `experiment-log` list → create → scaffold under the
   workspace path.
5. **Execute** — `experiment-run` with real artifact paths; batch runs by
   dependency; summarize with ```artifact fences when helpful.
6. **Close the loop** — `results-snapshot` for key results; killed cells
   stay recorded in the matrix — never silently drop unfavorable runs.

## Rules

- Prefer fewer, interpretable runs over blind hyperparameter thrashing.
- When an ablation cannot answer the claim, redesign — do not only add seeds.
- Runtime/environment details (shared `.prismnext/.venv`, gates) live on the
  experiment tools — follow them, do not restate them here.