# Plan Mode for Writing — entry, plan shape, construction

`suggest-plan` pauses the turn and asks the user to enter Plan mode (15s
consent strip; timeout or dismiss ≡ stay in chat and just write). In Plan
mode the deliverable is a **plan document**, not prose — drafting happens
after the user accepts the plan.

## When to enter (and when not)

Enter plan mode when ALL of these hold:

- The outline (`outline.md`) is confirmed — plan mode executes a spec, it
  does not replace the outline discussion.
- The work spans **multiple sections or multiple turns** (a full drafting
  push, a refresh sweep after re-runs, a restructure).
- The user wants visible, checkable progress ("按计划一步步来").

Do NOT enter for: a single section draft (just write it), the outline
discussion itself (that is conversation + `question`), or exploratory
chat.

How to enter: call `suggest-plan` with a one-sentence reason naming the
scope, e.g. "按 outline.md 的 build order 逐章起草全文（5 步）". If the
user dismisses or the strip times out, proceed in chat without complaint.

## Constructing the plan (the thinking)

1. **Derive steps from the outline's Build order** — one plan step per
   build-order item, never invented from thin air. If the outline says
   Results is blocked on re-run r7, the plan says so instead of scheduling
   it early.
2. **Granularity: one section per step** — finer than that (per paragraph)
   is micromanagement; coarser (the whole paper in one step) defeats the
   point. Exception: a heavy section may split into "assemble evidence"
   and "draft".
3. **Every step carries its own done-criteria** — which skill/pattern
   applies, which sources it consumes, what "done" means, and the
   verification (`latex-compile`, promise-map check).
4. **Bake in the bookkeeping** — the final step is always: update statuses
   in `outline.md` (done / stale), tell the user what moved.
5. **Mark dependencies** — a step that consumes another step's output says
   so; independent steps are marked parallel-safe.

## Plan document shape

```markdown
# Plan — <document title> drafting push

**Spec**: `outline.md` (story, promise map, build order)
**Goal**: <one sentence — e.g. all sections drafted, compile green>

## Steps

- [ ] 1. Draft Methods — pattern: pipeline angle (writing-methods);
      sources: notes/method.md, island exp-…; done when: construction
      motivated, receipts anchored, compiles
- [ ] 2. Draft Results — needs step… actually independent of 1; sources:
      exp-… runs r3/r5; done when: every number has a run id, reporting
      blocks complete
- [ ] 3. Refresh Introduction (stale) — C2 number moved after r7;
      done when: contribution sentence matches new receipt
- [ ] 4. Draft Conclusion — needs 2; answers Q1/Q2 from the promise map
- [ ] 5. Bookkeeping — update outline.md statuses; summarize what moved
      for the user

## Verification

- `latex-compile` after each drafting step
- Final: promise map fully kept or explicitly flagged
```

Keep the plan short enough to read in one screen — detail belongs in the
outline and the section skills, not duplicated here.
