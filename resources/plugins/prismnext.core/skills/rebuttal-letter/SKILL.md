---
name: rebuttal-letter
description: Use when responding to peer review — mapping every reviewer point to a manuscript change and drafting a point-by-point response / rebuttal letter.
license: MIT
---

# Rebuttal Letter

Every reviewer point gets one of three fates — accepted change,
clarification, or evidence-backed pushback — and the letter proves each
change with a real location in the manuscript.

## When to use

- Writing rebuttals or revision cover letters
- Mapping reviewer comments to concrete manuscript edits

## Workflow

1. **Parse** — split the review into atomic points (R1.1, R1.2, R2.1, …).
2. **Track** — for anything beyond a handful of points, keep a working
   `rebuttal-map.md` (in `specs/`, or next to the manuscript): one row per
   point — disposition, planned change, location anchor, status. This table
   is the source material for the letter and the guard against losing
   points in a long review.
3. **Triage with the user** — per point: accept (we change), clarify (text
   was unclear), or push back (with evidence). These dispositions are the
   user's decisions, not yours — surface them with the `question`
   interaction (batch related points per question) rather than burying a
   30-item list in prose for the user to answer by typing.
4. **Make the changes** — edit the manuscript; surface edits as reviewable
   diffs / Proposed Changes. Record a location anchor (section, line range)
   per change, in the map.
5. **Draft the letter** — per point: quote (short) → response → what changed
   and where → optional short diff quote. Polite, specific, no filler
   apologies.
6. **Pushback points need citations** — stage external papers via
   `literature-stage` before citing them in the letter.
7. **Re-verify** — `latex-compile` and `citation-health` after the edits.

## The "run more experiments" fork

Reviewer requests for new experiments are the expensive kind of point.
Never start runs inside this skill:

- Estimate the cost first (compute, wall-clock, what "done" looks like) and
  confirm with the user before anything runs — the standing
  cost-before-compute rule.
- If the request needs real design (baselines, ablations, budgets), route
  to `experiment-design-matrix` when enabled; otherwise discuss the design
  in conversation first, the same ground covered.
- The rebuttal answer for an experiment point cites actual runs — run ids,
  dates — never anticipated results.

## Rules

- Every "we have changed X" must map to a real diff and a location.
- Never tone-police the reviewers into strawmen — quote their actual point.
- If the venue wants a marked-up manuscript, say so and produce it as a
  separate file — `latexdiff` against the previous snapshot when it is
  available in the environment; otherwise a change list keyed by section.