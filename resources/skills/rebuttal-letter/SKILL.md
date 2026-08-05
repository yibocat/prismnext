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
2. **Triage with the user** — per point: accept (we change), clarify (text
   was unclear), or push back (with evidence). Do not decide unilaterally.
3. **Make the changes** — edit the manuscript; surface edits as reviewable
   diffs / Proposed Changes. Record a location anchor (section, line range)
   per change.
4. **Draft the letter** — per point: quote (short) → response → what changed
   and where → optional short diff quote. Polite, specific, no filler
   apologies.
5. **Pushback points need citations** — stage external papers via
   `literature-stage` before citing them in the letter.
6. **Re-verify** — `latex-compile` and `citation-health` after the edits.

## Rules

- Every "we have changed X" must map to a real diff and a location.
- Never tone-police the reviewers into strawmen — quote their actual point.
- If the venue wants a marked-up manuscript, say so and produce it as a
  separate file.