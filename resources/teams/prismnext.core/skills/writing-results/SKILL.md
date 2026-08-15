---
name: writing-results
description: Use when drafting a Results / Experiments / Analysis section — narrating verified evidence from run receipts, with complete statistical reporting, derivation analysis, and honest treatment of negative results. Every number traces to a run; every claim survives the audit.
license: MIT
---

# Writing: Results

The Results section is where evidence becomes claims. Two disciplines meet
here: **receipts** (every number traces to a run — nothing from memory) and
**verification** (every quantitative claim carries its statistical
treatment; every derivation is machine-checked). A Results section that
only reports the wins is marketing, not evidence.

If `writing-design` produced `outline.md`, the promise map says which
Introduction claims this section must prove. Without an outline, ask the
user which claims this section settles.

## When to use

- Drafting or rewriting Results / Experiments / Empirical Analysis
- Turning runs and verification artifacts into claims with receipts
- Auditing a draft Results section against the runs behind it

## Files in this skill

- `templates/claim-first.md` — one subsection per claim: claim → evidence →
  strength. Best when the paper makes a few strong claims.
- `templates/question-first.md` — one subsection per research question:
  question → experiment → answer → caveats. Best for exploratory or
  multi-question studies.

These are **reference patterns, not molds** — adapt, blend, or depart as
the material demands; the bar is a section that reads true, not one that
matches a file.

## Workflow

1. **Read the spec** — `outline.md` promise map when present; else the
   claim list from the user / brief.
2. **Discuss the pattern with the user** — present their trade-offs. Use
   `question` when the call is genuinely theirs — e.g. which claim they
   believe is strongest and which they least trust (ordering and honesty
   both depend on it); when the conversation already answers these, do not
   re-ask.
3. **Assemble evidence per claim** — `experiment-log` read, `results-snapshot`,
   `provenance-query`: which runs support this claim, at what strength.
4. **Draft** — every quantitative claim carries the full reporting block:
   test, statistic, df, p, effect size + CI, n, assumptions checked,
   multiplicity correction (the `statistical-rigor` skill when enabled).
   Derivations and symbolic steps machine-checked (`symbolic-math` when
   enabled) and presented as verification notes, not bare equations.
5. **Include the negatives** — failed runs and killed hypotheses that shaped
   the conclusions get reported with what they bound. Hiding them is
   misconduct; reporting them is credibility.
6. **Figures** — wired per `figure-pipeline` when enabled; each figure
   referenced in text with a "what to look at" sentence.
7. **Consistency pass** — every claim in this section maps back to an
   Introduction promise; every number matches its receipt exactly.
8. **Verify** — `latex-compile`.
9. **Report to the outline** — when `outline.md` exists, mark this section
   `done` with a one-line note; if a re-run moved numbers, mark the
   affected sections `stale` in the outline and tell the user.

## Done when

- Every number traces to a run id (receipt anchors per house convention).
- Every claim has its statistical reporting block complete.
- Negative/failed evidence that shaped conclusions is reported.
- Derivations machine-checked.
- `latex-compile` passes.

## Rules

- Never smooth over a failed check — report what it bounds.
- "Significant" appears only with its test, effect size, and CI.
- Exploratory findings are labeled exploratory.
