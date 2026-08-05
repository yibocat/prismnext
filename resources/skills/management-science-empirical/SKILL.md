---
name: management-science-empirical
description: Use for management-science and decision-science research — causal identification (DiD/IV/RDD/panel), behavioral experiment design, robustness batteries, regression tables, and theory models with verified comparative statics. Evidence here informs decisions; the standard is "a decision-maker may act on this".
license: MIT
---

# Management Science & Decision Science

This field's output is advice someone may act on — a policy, an incentive
scheme, an operations rule. That sets the bar: identification you believe,
models whose comparative statics are actually checked, and robustness that
survives your own skepticism before anyone else's. The loop is
**theory ↔ empirics ↔ decision relevance**.

## When to use

- Designing or auditing a causal-identification strategy (DiD, IV, RDD, panel)
- Designing a behavioral/lab/online experiment (incentives, preregistration)
- Building the robustness battery for an empirical result
- Writing up regression evidence (tables from `templates/`)
- Developing a theory model: propositions + comparative statics
  (verify with `symbolic-math`)
- Running simulation/ABM studies (the seed and logging discipline is shared
  with `ml-research-protocol`)

## Files in this skill

Read on demand:

- `references/identification-strategies.md` — DiD / IV / RDD / panel FE:
  assumptions, how to check them, and the fatal errors. Read before claiming
  causality.
- `references/behavioral-experiments.md` — design checklist: preregistration,
  power, incentive compatibility, attention checks, exclusion rules, IRB.
- `references/robustness-battery.md` — the ordered robustness list, from
  alternative measures to specification curves.
- `templates/regression-table.tex` — three-star booktabs panel table with
  FE/controls/clustering rows and the notes line.
- `templates/proposition-block.md` — theory block: setup, assumptions,
  proposition, proof sketch, comparative-statics table, verification note,
  managerial implication.
- `scripts/simulate_did.py` — stdlib-only DiD simulator: generates a panel,
  estimates the 2×2 effect, checks pre-trends. Use to sanity-check designs
  and teach the logic.

## Workflow

1. **Question as a decision** — state who decides what, and which estimate
   would change the action. This fixes the estimand before any method talk.
2. **Theory first when modeling** — propositions via
   `templates/proposition-block.md`; comparative statics verified with
   `symbolic-math` (SymPy), never by hand.
3. **Identification before regression** — pick the design in
   `references/identification-strategies.md`; write the identifying
   assumption in one sentence and how you will check it. Run
   `scripts/simulate_did.py`-style simulations when the design is new to you.
4. **Power and preregistration for experiments** — sample size from
   `statistical-rigor`'s `power_analysis.py`; exclusions and hypotheses
   fixed before data (see `references/behavioral-experiments.md`).
5. **Estimate, then attack your own result** — the robustness battery in
   `references/robustness-battery.md`, in order. Statistical treatment per
   `statistical-rigor` (clustered SEs, effect sizes, multiplicity).
6. **Report for a decision-maker** — tables from `templates/`; every claim
   carries the magnitude and what action it supports, not just significance.

## Rules

- Correlation language for correlational designs. The word "effect" is
  earned by the identification strategy, not by the software.
- The identifying assumption is stated in the paper's own words, checked
  with data where checkable, and flagged where not.
- Standard errors clustered at the treatment-assignment level — the rules
  are in `references/identification-strategies.md`.
- Stars are decoration; the point estimate, CI, and economic magnitude are
  the result.
- A robustness check that fails is a finding — report it and say what it
  bounds.
