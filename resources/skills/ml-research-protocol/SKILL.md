---
name: ml-research-protocol
description: Use when running empirical machine-learning experiments — baseline and ablation discipline, multi-seed aggregation, reproducibility logging, and results you can trust, decide on, and defend. Wires the experiment island to statistical-rigor and the manuscript.
license: MIT
---

# ML Research Protocol

Empirical ML is a decision factory: every experiment decides whether a line
of work lives, dies, or pivots. Those decisions are only as good as the
evidence — single-seed numbers, untuned baselines, and hand-typed tables
corrupt them quietly. This skill is the discipline that keeps your own
results trustworthy. Being review-ready then costs nothing extra.

## When to use

- Designing an experiment matrix (pair with `experiment-design-matrix`)
- Deciding between methods or variants from your own results
- Aggregating results across seeds; building results tables
- Auditing whether a conclusion you rely on is actually supported
  (pair with `critical-review`, `statistical-rigor`)
- Preparing the reproducibility statement / appendix

## Files in this skill

Read on demand:

- `references/reproducibility-checklist.md` — the reproducibility and
  compute-reporting checklist (NeurIPS-style), seed policy, code/data
  availability statements.
- `references/baselines-and-ablations.md` — fair-comparison rules, ablation
  design, and the reviewer attack list. Read before claiming "SOTA".
- `templates/experiment-log.md` — per-run manifest: commit, config, seeds,
  environment, compute. One per experiment island.
- `templates/results-table.tex` — booktabs results table, mean±std, bold
  best with significance footnote.
- `templates/hyperparameters-table.tex` — appendix hyperparameter table.
- `scripts/aggregate_seeds.py` — stdlib-only: per-seed CSV → mean / std /
  t-based 95% CI per method → LaTeX table rows with bold-best marking.

## Workflow

1. **Predefine** — the experiment matrix (via `experiment-design-matrix`)
   includes the seed list *before* any run. 3 seeds minimum, 5 preferred;
   the seeds are fixed integers written into the log, not "run until nice".
2. **Log every run** — `templates/experiment-log.md` per island: git commit,
   config diff, seeds, hardware, wall-clock. The experiment island's
   provenance already captures env and commands — the log adds intent.
3. **Aggregate mechanically** — collect per-seed metrics into one CSV, run
   `scripts/aggregate_seeds.py` (project venv via `experiment-run`), paste
   the emitted LaTeX rows. Table numbers are never typed by hand.
4. **Discipline the claims** — differences between methods get the
   `statistical-rigor` treatment (test, effect size, CI). When the result
   drives a decision (continue / kill / pivot), say what evidence threshold
   you used; "significant" is a statistical statement, not an adjective.
5. **Report** — tables from `templates/`; figures via
   `scientific-visualization`; Methods text via `experiment-to-methods`;
   finish with `manuscript-preflight`.

## Rules

- A single-seed number is an anecdote. Report mean±std over predefined seeds
  or say "single run" in the text.
- Baselines get the same tuning budget as your method — an untuned baseline
  does not just look bad in review, it makes your own kill/continue
  decisions wrong.
- Never tune on the test set; selection happens on validation, the test set
  is touched once per claim.
- Bold-best in a table requires the overlap check (CI overlap or test) —
  see `references/baselines-and-ablations.md`.
- Every number in a table, note, or decision log traces to a run in a log.
  If you cannot point at the run, the number does not exist.
