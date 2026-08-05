---
name: hypothesis-design
description: Use when sharpening a research idea into falsifiable hypotheses, pre-registering claims/metrics/stopping criteria in the project brief, or pressure-testing whether an idea is worth testing.
license: MIT
---

# Hypothesis Design

Sharpen ideas into falsifiable, pre-registered hypotheses — before any run
happens. This is the anti-HARKing discipline: decide what would change your
mind *before* you see the data.

## When to use

- A vague idea needs to become testable hypotheses
- Pre-registering claims, metrics, and thresholds before experiments
- Pressure-testing whether an idea is worth empirical effort at all

## Workflow

1. **Read the spine** — `research-brief-read`. Situate the idea in the
   existing through-line (or note that it diverges).
2. **Candidate hypotheses** — one sentence each, falsifiable: state the
   observation that would *kill* it. Label every one as a **candidate**.
3. **Per hypothesis** —
   - Evidence kinds that would support vs weaken it
   - Confounds and alternative explanations
   - The cheapest decisive test available in this workspace
4. **Pre-commit** — metrics, thresholds, seeds, stopping criteria, and what
   each possible outcome changes next. Write this *before* running.
5. **Confirm, then persist** — walk the user through the candidates; after
   confirmation, `research-brief-update` (one section per call, first
   person).
6. **Hand off** — empirical work → create an island with `experiment-log`;
   multi-phase programs → `suggest-plan`.

## Rules

- Hypotheses stay labeled candidates until evidence lands.
- Never retrofit hypotheses to observed results — that is HARKing; flag it
  plainly when it happens.
- Orchestrator may delegate a challenge pass to `research-design-coach`;
  experts cannot Task — pressure-test inside your own deliverable.