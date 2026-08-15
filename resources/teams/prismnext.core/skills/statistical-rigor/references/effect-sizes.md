# Effect Sizes & Confidence Intervals

p tells you whether noise could explain the data; effect size tells you
whether anyone should care. Always report both.

## Which one

| Situation | Effect size |
|---|---|
| 2 means, continuous | Cohen's d; use **Hedges' g** (small-sample corrected) when n < ~20/group |
| Paired means | d_z (SD of the *differences*) — say which d you used |
| ANOVA | η² or partial η²; better: report pairwise g for the contrasts that matter |
| Correlation | r itself (with CI); R² for models |
| 2 proportions | risk difference AND risk ratio or odds ratio (RD is the one readers misread least) |
| Nonparametric | rank-biserial r (Mann–Whitney), matched-pairs r (Wilcoxon) |

## Computation notes

- Cohen's d = (M₁ − M₂) / SD_pooled; Hedges' g = d × (1 − 3/(4N − 9)).
- Welch's t → use each group's own SD context or Glass's Δ when variances
  differ wildly; say which you used.
- For ML comparisons (accuracy deltas), the *percentage-point* difference
  with a CI is usually more honest than d.

## Interpretation

- Cohen's benchmarks (0.2 / 0.5 / 0.8) are field-naive. Compare against
  effect sizes typical in *your* venue's recent papers instead.
- A significant but tiny effect can be the right finding ("we can rule out
  practically meaningful differences" needs an equivalence test — TOST —
  not a failed t-test).

## Confidence intervals

- Report the CI for the effect size, not only for each group's mean.
- Bootstrap percentile CIs are acceptable and assumption-light; state the
  number of resamples (≥ 10,000 for publication).
- A 95% CI that excludes the null ≈ p < 0.05 — do not report both as if they
  were two findings.

## Equivalence (proving "no meaningful difference")

- Use TOST: define the smallest effect size of interest (SESOI) *before*
  looking, then test whether the CI fits inside ±SESOI.
- "p > 0.05 therefore no difference" is a logic error — flag it in reviews.
