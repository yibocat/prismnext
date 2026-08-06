---
name: hypothesis-design
description: Use when an idea is about to move from open exploration into empirical testing — sharpening it into falsifiable hypotheses and pre-registering what would change your mind before any run happens. Not for early free-form brainstorming; that belongs in ordinary chat.
license: MIT
---

# Hypothesis Design

The **pre-registration gate** between exploration and empirical work.
Open-ended brainstorming and early pressure-testing happen in ordinary chat
(Research design module). Invoke this skill when an idea is ripe enough that
you are about to spend runs on it — decide what would change your mind
*before* you see the data. This is the anti-HARKing discipline.

Be a sparring partner, not a judge: stress-test the **clarity** of a
hypothesis, never veto the user's idea. The only hard no is retrofitting
hypotheses to results already seen.

## When to use

- An idea is about to consume empirical effort (runs, data collection)
- Sharpening a claim into falsifiable hypotheses with explicit kill conditions
- Pre-registering claims, metrics, and stopping criteria before experiments

## Workflow

1. **Read the spine** — `research-brief-read`. Situate the idea in the
   existing through-line (or note that it diverges).
2. **Candidate hypotheses** — one sentence each, falsifiable: state the
   observation that would *kill* it. Label every one as a **candidate**.
3. **Per hypothesis** —
   - Evidence kinds that would support vs weaken it
   - Confounds and alternative explanations
   - The **cheapest decisive test available in this workspace**: existing
     data or artifacts on disk, a seconds-long probe script via
     `experiment-run`, or a small slice of an existing pipeline — check
     these before proposing any new full-scale experiment.
4. **Pre-commit** — per hypothesis: metrics, thresholds, seeds, stopping
   criteria, and what each possible outcome changes next. Write this
   *before* running.
5. **Confirm, then persist** — walk the user through the candidates; after
   confirmation:
   - Hypotheses and claims → `research-brief-update` (one section per call,
     first person).
   - Metrics, thresholds, seeds, stopping criteria → the experiment design
     artifacts (design matrix / island), not the brief — the brief holds
     the story, not the protocol.
6. **Hand off** — empirical design → the design-matrix step
   (`experiment-design-matrix` when enabled); running → an island with
   `experiment-log`; multi-phase programs → `suggest-plan`.

## Done when

- Every hypothesis has a stated kill condition and is labeled a candidate.
- Every hypothesis names its cheapest decisive in-workspace test.
- Pre-commitments are written before any run, and the user has confirmed them.
- Claims live in the brief; protocol details live in the design matrix /
  island.

## Rules

- Hypotheses stay labeled candidates until evidence lands.
- Never retrofit hypotheses to observed results — that is HARKing; flag it
  plainly when it happens.
- Present weaknesses and alternative explanations honestly, but the decision
  to pursue an idea is always the user's.
- Orchestrator may delegate a challenge pass to `research-design-coach`;
  experts cannot Task — pressure-test inside your own deliverable.
