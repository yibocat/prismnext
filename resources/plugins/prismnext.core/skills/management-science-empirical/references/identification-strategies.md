# Identification Strategies

For each design: the identifying assumption, how to check it, and the fatal
errors. Pick the design before touching regression output.

## Difference-in-differences (DiD)

- **Assumption**: parallel trends — absent treatment, treated and control
  would have followed the same path. Untestable directly; supported by
  pre-trends.
- **Check**: event-study plot of pre-period coefficients ≈ 0; different
  pre-period lengths; placebo treatment dates. `scripts/simulate_did.py`
  shows the logic on synthetic data.
- **Fatal errors**: staggered adoption with two-way FE (negative weights —
  use Callaway–Sant'Anna or Sun–Abraham estimators); treatment anticipation
  (shift the window or use a donut); selecting on post-treatment outcomes.
- **SEs**: cluster at the level treatment varies (state, firm) — not the
  individual observation.

## Instrumental variables (IV)

- **Assumptions**: relevance (instrument moves the treatment) and exclusion
  (instrument reaches the outcome *only* through the treatment). Exclusion
  is argued, not tested.
- **Check**: first-stage F > 10 (rule of thumb; report it); reduced form
  makes sense; over-identification tests when you have more instruments
  than endogenous variables; discuss who the compliers are (LATE).
- **Fatal errors**: weak instruments with 2SLS (biased toward OLS);
  "instrument" that plausibly affects the outcome directly (rainfall → many
  channels); interpreting LATE as ATE.

## Regression discontinuity (RDD)

- **Assumption**: agents cannot precisely manipulate the running variable
  around the cutoff; nothing else jumps at the cutoff.
- **Check**: McCrary density test (bunching); covariate balance at the
  cutoff; donut RDD if manipulation is suspected; bandwidth sensitivity.
- **Fatal errors**: global polynomial fits (use local linear, triangular
  kernel); too many covariates (they should be irrelevant at the cutoff);
  data-mined bandwidths.

## Panel fixed effects

- **Assumption**: the unobserved confounder is time-invariant (within
  estimator removes it); strict exogeneity of regressors given the FE.
- **Check**: within vs between comparison; FE for time shocks; correlated
  random effects (Mundlak) as a middle ground.
- **Fatal errors**: FE does nothing for time-varying confounders; lagged
  dependent variable + FE = Nickell bias; interpreting FE coefficients with
  little within variation (report it).

## Clustering rule of thumb

Cluster at the level at which treatment is assigned. Few clusters (< ~40) →
wild bootstrap. Two dimensions of correlation (firm × time) → two-way
clustering. When in doubt, cluster higher — the cost is power, the
alternative is false confidence.
