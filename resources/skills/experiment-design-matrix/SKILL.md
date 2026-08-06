---
name: experiment-design-matrix
description: Use when planning experiments, ablations, or evaluation sweeps — before a costly run series, or when adding new cells (e.g. ablations) to a running campaign. Turns pre-registered hypotheses into a factor matrix with fair baselines, metrics, seeds, and stopping criteria. Not needed for trivial probes and smoke tests.
license: MIT
---

# Experiment Design Matrix

Design before looping runs. This skill receives the **pre-registered claims**
from hypothesis design (via `.brief.md`) and expands them into a concrete
factor matrix — so every later run is interpretable against what was
pre-committed.

**Proportionality rule**: the design record scales with the cost of the
runs. A seconds-long probe or smoke test needs one sentence in chat; a sweep
that burns dozens of runs needs the full matrix below. Never write a design
doc heavier than the experiments it governs.

One design doc covers a whole **campaign** (a matrix of runs), not each
individual run — per-run records are kept automatically by the experiment
tools.

## When to use

- Planning a new experiment, ablation study, or evaluation sweep
- Adding cells (ablations, controls, new levels) to a campaign already running
- Turning pre-registered hypotheses into a concrete factor matrix
- The user is about to fire ad-hoc scripts with no design record

## Workflow

1. **Anchor** — `research-brief-read` to pick up the pre-registered claims,
   metrics, and thresholds this matrix serves (optional for small probes,
   never a gate).
2. **Scaffold first** — `experiment-log` list → create → scaffold under the
   workspace path; the design doc (`design.md`) is the island's first file.
3. **Write the design doc** —
   - Question being answered, linked to the claim it tests
   - Factors × levels (independent variables)
   - Baselines and controls — and why each comparison is *fair*
   - Metrics with precise definitions
   - Seeds / repeats
   - Stopping criteria
   - Artifact paths that must survive
4. **Cheap-first order** — smoke test → single matrix cell → full sweep.
5. **Confirm cost, then execute** — before the full sweep, state the
   estimate (runs × per-run time × resources) and confirm with the user via
   `question`; smoke tests and single cells run without ceremony. Execute
   with `experiment-run` (real artifact paths; batch runs by dependency;
   summarize with ```artifact fences when helpful).
6. **Close the loop** — `results-snapshot` for key results; killed cells
   stay recorded in the matrix — never silently drop unfavorable runs.

## Done when

- Every factor has levels; every comparison has a fairness argument.
- Stopping criteria are written before the sweep starts.
- A smoke test has passed before any full sweep.
- The design doc lives in the island, next to the runs it governs.

## Boundaries

- **Sample size, power, and test selection** → `statistical-rigor`; this
  skill records *what* was decided, not the statistics behind it.
- **Runtime/environment details** (shared `.prismnext/.venv`, gates) live on
  the experiment tools — follow them, do not restate them here.

## Rules

- Prefer fewer, interpretable runs over blind hyperparameter thrashing.
- When an ablation cannot answer the claim, redesign — do not only add seeds.
- Mid-campaign additions extend `design.md` in place; do not fork a second
  design doc for the same campaign.
