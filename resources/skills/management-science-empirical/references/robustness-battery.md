# The Robustness Battery

Run in this order. Stop when you believe the result yourself — that belief
is the product.

1. **Alternative measures of the outcome (and treatment).** Same sign,
   similar magnitude across operationalizations. If the result lives in one
   measure only, the finding is about the measure.
2. **Alternative samples.** Reasonable inclusion windows: drop outliers
   (transparently), vary time windows, drop borderline units. The estimate
   should move smoothly, not jump.
3. **Alternative specifications.** Controls in/out in blocks; functional
   forms (levels/logs); fixed-effect structure. Show the coefficient path
   across specifications — a specification curve if there are many.
4. **Placebo tests.** Fake treatment times, fake treatment groups,
   impossible outcomes (variables the treatment cannot affect). A placebo
   that "works" kills the design.
5. **Alternative estimators.** Nonparametric or semiparametric check;
   for DiD: Callaway–Sant'Anna vs TWFE; for RDD: bandwidth ladder.
6. **Heterogeneity — pre-specified vs exploratory.** Pre-specified
   moderators from theory get reported regardless of outcome;
   data-driven heterogeneity is labeled exploratory and gets the
   multiplicity treatment.
7. **Bounding exercises.** Selection-on-unobservables bounds
   (Oster's δ), sensitivity of IV to exclusion violations, worst-case
   attrition bounds (Lee bounds) for experiments with dropouts.

## Reporting rules

- A failed check is a finding: report it and say what it bounds.
- The battery goes in the appendix as a table or figure; the paper's text
  says what was checked and what (if anything) moved.
- The robustness section is written for the reader who wants to kill your
  result — write it so that reader runs out of ammunition.
