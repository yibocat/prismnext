# Experiment log — <experiment-id>

One per experiment island. The island's provenance captures commands and
environment automatically; this log captures **intent and identity** — the
things future you (or anyone auditing the claim) asks about.

## Identity

- Git commit: `<hash>` (dirty tree? list uncommitted files)
- Config: `<path or diff summary>`
- Date / operator: `<date>` / `<who>`

## Hypothesis

One sentence: what comparison does this experiment decide, and in which
direction do we expect it to go *before* running?

## Protocol

- Dataset + split: `<name, split hash or file>`
- Seeds (predefined): `1, 2, 3` (list fixed BEFORE running)
- Model selection: validation metric `<name>`; test set touched once
- Baselines: tuning budget per baseline `<range / #trials>`

## Runs

| run | seed | status | metrics artifact |
|-----|------|--------|------------------|
| …   | 1    | done   | `results/<file>` |

Aggregate with `scripts/aggregate_seeds.py` — table rows come from its
output, never typed by hand.

## Compute

- Hardware: `<GPU/CPU, count>`
- Wall-clock per run: `<h>`; total: `<GPU-hours>`

## Deviations

Anything that departed from the protocol, with date and reason. Deviations
are allowed; hiding them is not.
