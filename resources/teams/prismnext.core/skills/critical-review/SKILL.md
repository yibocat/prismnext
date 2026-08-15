---
name: critical-review
description: Use for a deliberate critical deep pass — over a manuscript or paper (reviewer-grade review), a claim or plan in conversation, a decision about to be made, the AI's own previous output (self-critique), or the methods and reasoning of published work. Critical here means reverse-angle analysis — inverting, steelmanning, shifting perspective — not negation. The product is what survives and what needs reinforcement.
license: MIT
---

# Critical Review

Critical thinking as **perspective inversion**, applied deliberately. Not
negation, not fault-finding: take the object — a paper, a claim, a plan, a
decision, your own previous answer — and look at it from the reverse
angle until you can say what survives, what does not, and what would
change the picture. A criticism that cannot name what would fix it is a
vibe, not a critique.

Two registers, one discipline:

- **The deep review** — a work deserves a reviewer-grade pass (a draft
  before sharing, a library paper you may build on).
- **The thinking move** — mid-conversation, at a decision point, or turned
  on yourself before delivering something consequential. Lighter, faster,
  same honesty.

Lightweight critical thinking is already always-on (the scholarly-reasoning
discipline). This skill is for when the stakes justify a *deliberate* pass.

## When to use

- Evaluating a manuscript draft before submission or sharing
- Deep-assessing a library paper's claims, methods, or reasoning
- Stress-testing a claim, idea, or plan that emerged in conversation
- Re-examining a decision before committing to it
- Self-critique: the AI's own previous answer, analysis, or plan — before
  the user acts on it

## The reverse-angle toolbox

Pick per object; combine when the stakes are high.

- **Invert** — do not ask "why is this right"; ask "what would make this
  fail?" Enumerate the conditions under which the conclusion dies.
- **Steelman** — build the strongest opposing position, strong enough that
  its proponent would sign it. Only then respond to it.
- **Shift coordinates** — the same object from a different discipline, a
  different scale, a different time horizon, a different stakeholder. What
  changes?
- **Premortem** — "It is six months later and this failed. What most
  likely killed it?"
- **Evidence question** — what evidence would change the conclusion? If
  nothing could, the claim is not empirical — say so.
- **Base-rate check** — how do claims of this kind usually fare? Novelty,
  effect sizes, and "this time is different" all have base rates.

## Per object

**A manuscript or draft (reviewer-grade).**
Default execution: Task the `peer-reviewer` expert (when experts are
available) — hand it the goal, the manuscript path, the target venue if
known, and what to focus on. Its value is independence: it was not part of
the conversation that produced the draft. The checklist below is both the
briefing you give it and the rubric you audit its report against:

1. Fix the object (file tools; for library papers `literature-read` /
   `literature-read-pdf`).
2. Claims table: each load-bearing claim → its evidence in the text →
   supported / weak / unsupported.
3. Assumptions named explicitly; mark the load-bearing ones.
4. Red flags: p-hacking, HARKing, cherry-picked baselines, missing
   ablations, overclaimed novelty, unreleased code/data promises,
   citation stuffing.
5. Reproducibility: could an independent group rerun this from the text
   alone? List exactly what is missing.
6. Verdict: what survives, what does not, what evidence would change your
   mind; concrete fixes ranked by leverage.

When no expert is available, run the same six steps in conversation — say
so, since a self-review carries the conversation's priors.

The review report uses the conference shape — Summary / Strengths /
Weaknesses (numbered, major vs minor) / Questions for the authors /
Recommendation — the peer-reviewer's native return shape. Then fold it
into the four statements below as the action layer: what to reinforce, in
what order. The numbered weakness list also feeds `rebuttal-letter`
directly, when enabled — self-review → revise → mock rebuttal is a full
rehearsal loop.

**A published paper's methods or reasoning.**
Restate the argument charitably first (the steelman obligation). Then
internal validity (does the design support the claim?), external validity
(where does it stop applying?), and the assumptions the authors never
state. The aim is understanding sharper than the authors' own framing —
not a takedown. Stage before citing (`literature-stage`).

**A claim, idea, or plan in conversation.**
Invert it, steelman the rival, run the evidence question. Keep it
proportionate — this is minutes, not a report. The output is spoken in
chat: what survives, what needs a test, what to watch.

**A decision about to be made.**
Premortem + reversal test (would I accept this reasoning if it supported
the opposite choice?) + what information would change the decision and
whether it is gettable before committing.

**Self-critique (the AI's own output).**
Before delivering a consequential answer or plan, attack it with the same
tools: where is my reasoning thinnest, what did I assume without noticing,
what would a skeptic quote against me? Label residual doubts honestly in
the deliverable instead of sanding them off. Same standard as
other-critique — no softpedaling yourself, no harshness theater either.

## Output shape

For a manuscript under reviewer-grade pass: the conference-format review
report (per the previous section), followed by the four statements as the
action layer.

For every other object, the pass ends directly in four statements:

1. **What survives** — and why it survives.
2. **What does not** — with the exact anchor (quote / page / section / the
   claim as stated).
3. **What would change the picture** — evidence, experiment, or argument.
4. **Reinforcements** — concrete fixes, ranked by leverage. Never "drop
   it" — always "here is where it needs strengthening".

## Rules

- **Steelman first** — restate the position to its proponent's
  satisfaction before inverting it. Criticizing a position you have not
  reconstructed is attacking a scarecrow.
- Ground every criticism — quote, page, and section for documents; the
  exact claim as stated for conversation. No vibes.
- Evaluate the work, never rank the people. Confidential and local.
- Reverse, then rebuild: every pass ends on the constructive side — what
  to reinforce, what to test next.
- Delegate the independent manuscript pass to `peer-reviewer` when experts
  are available (see the manuscript section); fold its report into your
  four statements instead of re-reviewing in parallel. A challenge pass on
  research design can go to `research-design-coach` when available.

## Done when

- The four output statements exist, each grounded.
- Every "does not survive" carries its anchor and a candidate fix.
- Residual doubts are stated, not hidden — including in self-critique.
