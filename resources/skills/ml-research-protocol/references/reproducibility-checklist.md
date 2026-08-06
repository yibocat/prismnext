# Reproducibility & Compute-Reporting Checklist

Condensed from community reproducibility checklists (NeurIPS-style) and
common artifact-evaluation practice. Work it top to bottom before you rely
on the results — and revisit it before writing them up; every "no" is
either a fix or an explicit limitation you record.

## Claims & scope

- [ ] Claims map 1:1 to experiments actually run
- [ ] Limitations stated (assumptions, failure modes, scope of validity)

## Theory (if any)

- [ ] Assumptions stated next to each claim; proofs complete or clearly
      sketched with the full version in appendix
- [ ] Symbolic steps machine-checked (SymPy check script — the
      `symbolic-math` skill packages this when enabled)

## Experiments

- [ ] Datasets: splits fixed and reported; preprocessing scripted, not
      manual; licenses and PII status stated
- [ ] Baselines: same data, same splits, comparable tuning budget; official
      numbers cited vs rerun distinguished in the table
- [ ] Seeds: predefined list, mean±std reported; count scaled to run cost
      (cheap: ≥3, 5 preferred; expensive: fewer seeds + labeled variance
      stand-in such as bootstrap or CV folds)
- [ ] Hyperparameters: full table in appendix (use
      `templates/hyperparameters-table.tex`); search ranges and selection
      criterion (validation metric) stated
- [ ] Test set touched once per claim; model selection on validation only
- [ ] Statistical treatment: test named, effect size + CI reported (the
      `statistical-rigor` skill when enabled); multiple comparisons corrected

## Compute

- [ ] Hardware: GPU/CPU type and count, memory where relevant
- [ ] Wall-clock per run type and total project compute (GPU-hours)
- [ ] Training-time/parameter-count/FLOPs for each compared method where
      "efficiency" is claimed
- [ ] Energy/carbon statement where the reporting context calls for it

## Code & data availability

- [ ] Code availability sentence (repo URL or "upon acceptance"); commit/tag
      that produced the camera-ready numbers is named
- [ ] Data availability sentence; synthetic/derived data generation scripted
- [ ] Randomness controlled: framework seeds, cudnn determinism notes where
      it matters
- [ ] Environment pinned: lockfile or container; python/CUDA versions logged
      (the experiment island captures this per run — check the provenance)

## Writing hygiene

- [ ] Every table/figure number traces to a logged run (script-generated, not
      hand-typed)
- [ ] Error bars / ± values say what they are (std across seeds? 95% CI?)
- [ ] "SOTA" / "significant" / "efficient" each backed by a specific
      comparison in a table
