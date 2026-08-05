---
name: statistical-rigor
description: Use when choosing statistical tests, computing power or sample size, reporting effect sizes, correcting for multiple comparisons, or reviewing a results section for statistical validity.
license: MIT
---

# Statistical Rigor

Statistical decisions are where model memory is least reliable — this skill
carries the reference tables and a stdlib-only power script so the reasoning
is grounded, not recalled.

## When to use

- Choosing a test for an experiment or analysis
- Planning sample size / power before running (pair with `experiment-design-matrix`)
- Reporting results (pair with `experiment-to-methods`)
- Reviewing a results section for statistical validity (pair with `critical-review`)

## Files in this skill

Read on demand — do not preload everything:

- `references/test-selection.md` — decision tree: outcome type × groups ×
  pairing × assumptions → test. Read this first when picking a test.
- `references/effect-sizes.md` — which effect size, how to compute and
  interpret, confidence intervals.
- `references/multiple-comparisons.md` — FWER vs FDR, when each, and the
  pre-registration rule for primary endpoints.
- `scripts/power_analysis.py` — stdlib-only power / sample-size calculator
  (two-sample t, proportions, correlation). Run it via `experiment-run` or
  bash inside the project venv — never hand-wave a power number.
- `templates/results-block.md` — the reporting block every result should
  follow (test, statistic, df, p, effect size, CI, n, assumptions checked).

## Workflow

1. **Classify the data** — outcome type (continuous / binary / count /
   ordinal), number of groups, paired or independent, n per group.
2. **Pick the test from the table** — read `references/test-selection.md`;
   state the assumptions you are relying on and how you checked them.
3. **Plan before running** — if the question is "how many samples / seeds?",
   run `scripts/power_analysis.py`; record the inputs and the result in the
   experiment design doc.
4. **Report completely** — every claim gets the full block from
   `templates/results-block.md`. p alone is never a result.
5. **Multiplicity** — more than one hypothesis on the same data → read
   `references/multiple-comparisons.md` and say which correction applies.

## Rules

- Never choose a test from memory when the table exists — read the file.
- A p-value without effect size and CI is a red flag; say so when you see one.
- Post-hoc tests are labeled post-hoc. Exploratory findings are labeled
  exploratory. No exceptions.
- If assumptions fail, switch tests — do not "interpret cautiously".
