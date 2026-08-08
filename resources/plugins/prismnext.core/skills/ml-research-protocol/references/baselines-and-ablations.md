# Baselines, Ablations, and the Self-Attack List

How comparisons stay fair, and the standard ways they quietly break —
attack your own results before anyone else does.

## Fair-comparison rules

1. **Same data, same splits.** Any difference in preprocessing or split
   invalidates the comparison silently. One shared data pipeline for all
   methods.
2. **Tuning parity.** Baselines get a tuning budget comparable to yours.
   Record each baseline's tuning range and chosen config. A baseline on
   default hyperparameters first corrupts your own kill/continue calls —
   and is fatal the moment anyone else looks.
3. **Official numbers vs rerun.** If you cite published numbers, mark them
   (e.g. a dagger † "as reported") and never mix them unmarked with your
   reruns in the same column. Different evaluation protocols are different
   numbers.
4. **Same metric computation.** One evaluation script for all methods —
   subtle metric differences (tokenization, normalization, threshold) move
   scores more than many contributions.
5. **Budget parity where claimed.** If the claim is efficiency, equalize
   compute; if the claim is accuracy, report compute anyway.

## Ablation design

- One factor at a time off the full model; the ablation table reads as a
  delta story: full → minus-A → minus-B → …
- The ablation matrix comes from the experiment design doc
  (`experiment-design-matrix` when enabled); each cell gets
  the same seed discipline as the main result, or is labeled single-run.
- Ablate on the validation protocol, confirm the final story once on test.
- Include the "negative" ablations too — a component that does nothing is a
  finding, and removing it simplifies the paper.

## The self-attack list (preempt these)

- **Cherry-picked seeds** — you predefining the seed list is the defense;
  the experiment log is the receipt.
- **Untuned baseline** — the tuning-parity record is the defense.
- **Test-set peeking** — state the touch-once protocol wherever the result
  is reported.
- **Metric shopping** — report the standard metrics for the task even when
  unflattering; one omitted standard metric reads as concealment.
- **"Difference within noise"** — the bold-best overlap check (below) and
  a proper statistical treatment (test, effect size, CI — `statistical-rigor`
  when enabled).
- **Compute asymmetry** — the compute table from the reproducibility
  checklist.
- **Sim-to-real gap (embodied / robotics)** — simulator-only results say so
  in the claim sentence itself; list the sim parameters that matter
  (physics fidelity, domain randomization ranges) and, if any real-world
  probe exists, give it a row, however small.

## Bold-best rule

Bold a cell only when it is best **and** separated: its 95% CI does not
overlap the runner-up's CI, or a paired test over the per-seed values
rejects equality (`statistical-rigor` for the how, when enabled). Overlapping CIs on the
top two cells → bold neither, or bold both with a footnote "difference not
significant". A bolded cell that loses this check is the classic gotcha
that undermines an entire results table.
