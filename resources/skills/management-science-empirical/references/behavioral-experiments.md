# Behavioral Experiment Design Checklist

For lab, online, and field experiments with human subjects. Work this list
before data collection; every "later" answer is a future problem.

## Design

- [ ] Hypotheses written as directional predictions with the mechanism
      ("X increases Y *because* Z"), not "we test whether"
- [ ] Conditions: minimal set that identifies the mechanism; factorial
      designs named as such
- [ ] Randomization unit stated (individual / session / cluster) and the
      analysis matches it
- [ ] Manipulation check planned — the treatment must actually vary the
      intended construct
- [ ] Attention/comprehension checks planned, with the exclusion rule fixed
      now, not after seeing results

## Power & sample

- [ ] Target effect size justified (prior work, pilot, or smallest effect
      of practical interest — say which)
- [ ] N from `statistical-rigor`'s `power_analysis.py` (or equivalent),
      with inputs recorded
- [ ] Attrition/invalid-response inflation applied to the recruitment target

## Incentives & ethics

- [ ] Incentive compatibility: payoffs depend on the behavior you measure;
      hypothetical choices are labeled hypothetical
- [ ] Deception: justified, minimal, debriefed; if avoidable, avoid it
- [ ] IRB/ethics approval or exemption documented; consent text in appendix
- [ ] Payment fair and platform-compliant (for online panels)

## Preregistration

- [ ] Hypotheses, conditions, measures, exclusions, and the analysis plan
      registered (OSF or equivalent) before data collection
- [ ] Deviations from the preregistration logged with dates and reasons —
      deviations are allowed, hiding them is not

## Analysis discipline

- [ ] Primary analysis = preregistered analysis; everything else labeled
      exploratory
- [ ] Exclusion rules applied blind to condition where possible
- [ ] Multiple outcomes/covariates → correction per `statistical-rigor`
- [ ] Manipulation-check failures reported; "it worked" needs the number

## Reporting

- [ ] Materials/instruments shared or excerpted in appendix
- [ ] Sample demographics + recruitment channel + dates
- [ ] Effect sizes with CIs, not just p-values — the decision reader needs
      magnitudes
