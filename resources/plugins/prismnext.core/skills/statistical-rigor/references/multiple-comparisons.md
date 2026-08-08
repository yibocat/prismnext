# Multiple Comparisons

Every additional test on the same data spends from the same error budget.
Decide the budget *before* running, not after seeing p-values.

## The two regimes

| You care about | Controlling | Use when |
|---|---|---|
| Any false positive is costly (FWER) | P(any false rejection) | confirmatory claims, few tests, strong claims in abstract |
| Proportion of false hits (FDR) | E[false / rejected] | exploratory screens, ablation sweeps, many comparisons |

## Procedures

- **Holm–Bonferroni** (FWER) — uniformly more powerful than Bonferroni;
  default choice for confirmatory families. Sort p ascending, compare the
  i-th to α/(m − i + 1), stop at first non-rejection.
- **Benjamini–Hochberg** (FDR) — sort p ascending, find the largest i with
  p_(i) ≤ (i/m)·q, reject all up to it. Valid under independence / positive
  dependence; use **Benjamini–Yekutieli** if dependence is arbitrary.
- **Bonferroni** — only when the family is tiny and the audience expects it.

## The pre-registration rule

- Pick **one primary endpoint** (or a small primary family) before running.
  Everything else is secondary/exploratory and reported as such.
- Ablation sweeps over k variants: treat as one family, apply BH, and show
  the raw p-values in a table — let readers apply their own correction.
- Comparing against multiple baselines: each (method × baseline) pair is a
  test — count them honestly.

## Red flags to catch (yours and others')

- "p = 0.047" appearing only after the third metric tried — metric fishing.
- Reporting the best of several seeds without saying how many seeds ran.
- Correcting within a table but not across the paper's claims.
- HARKing: an exploratory hit re-narrated as the hypothesis. Label it
  exploratory instead — it loses nothing and stays true.
