# Test Selection

Decision tree for common research data. Assumptions are listed because you
must check them — a test chosen without its assumptions is a coin flip.

## Step 1 — outcome type

| Outcome | Examples | Family |
|---|---|---|
| Continuous | accuracy, latency, reaction time | parametric t/ANOVA or their nonparametric counterparts |
| Binary | success/fail, defect present | proportion tests, logistic models |
| Count | events per interval | Poisson / negative-binomial models |
| Ordinal | Likert ratings, ranks | nonparametric only |

## Step 2 — groups & pairing (continuous outcome)

| Design | Assumptions OK | Assumptions fail / small n |
|---|---|---|
| 1 sample vs fixed value | one-sample t | Wilcoxon signed-rank |
| 2 independent groups | Welch's t (default — do not assume equal variance) | Mann–Whitney U |
| 2 paired measurements | paired t | Wilcoxon signed-rank |
| ≥3 independent groups | one-way ANOVA (+ post-hoc) | Kruskal–Wallis (+ Dunn) |
| ≥3 paired/repeated | repeated-measures ANOVA | Friedman |
| 2 factors | two-way ANOVA | aligned-rank transform or permutation |

## Step 3 — binary / categorical outcome

| Design | Test |
|---|---|
| 2 proportions, independent | two-proportion z-test or Fisher exact (small n → Fisher) |
| ≥2 proportions / contingency | chi-square (expected counts ≥5; else Fisher) |
| Paired binary | McNemar |

## Correlation

| Relationship | Test |
|---|---|
| Linear, both continuous | Pearson r |
| Monotonic or ordinal | Spearman ρ |
| Small n / ties-heavy | Kendall τ |

## Assumptions to actually check

- **Normality** — matters for the *residuals*, not raw data. With n > ~30 per
  group the t/ANOVA family is robust; below that, look at a Q–Q plot or go
  nonparametric.
- **Equal variance** — skip the pre-test debate; use Welch by default.
- **Independence** — no test fixes clustered/pseudoreplicated data. If
  measurements cluster (per subject, per batch), you need a mixed model or
  cluster-robust errors, not a t-test.

## When in doubt

- Randomization / permutation tests are almost always defensible and make
  minimal assumptions — prefer them when the design is unusual.
- Report what you did about assumptions: "Shapiro–Wilk p=0.31, Q–Q plot
  unremarkable" is a sentence, not a ritual.
