---
name: writing-methods
description: Use when drafting a Methods / Methodology / Approach / Model section — expounding the ideas and the reasoning behind the method, grounded in the project's brief, notes, and prior discussions, with empirical details from run receipts. Structure follows the idea's shape; reference angles, not fixed templates.
license: MIT
---

# Writing: Methods

The purpose of a Methods section is that the reader finishes understanding
**the idea** — what the method is, why it is built this way, and why this
construction is right for this problem. Mechanics matter only insofar as
they serve that understanding. A section that lists components without
reasoning is a manual, not a paper.

Methods writing is the least templatable part of a paper: the right
structure follows the idea's shape. This skill offers **angles**, not
molds — study them, take what fits, blend or depart freely. The bar is a
section whose reasoning reads clear and true, never one that matches a
file.

## When to use

- Drafting or rewriting Methods / Methodology / Approach / Model sections
- Restructuring a component dump into a reasoned construction
- Aligning a Methods draft with what the Introduction promised

## Where the content comes from (in priority order)

1. **The thinking that already happened** — the brief, working documents in
   `specs/` (analysis, decision records), the user's notes, and decisions
   from prior discussions: why this approach was chosen, which alternatives
   were considered and rejected, and why. This is the spine of the section
   — recover it before inventing prose. When the reasoning lives only in
   the user's head, ask (`question`): the "why" is theirs, never yours to
   fabricate.
2. **The outline** — `outline.md`'s promise map (`writing-design` when
   enabled): which Introduction promises this section keeps.
3. **The receipts** — implementation details, hyperparameters, datasets,
   protocols: only from run logs (`experiment-to-methods` when enabled;
   else read the islands with `experiment-log`). Never from memory.
4. **The math check** — derivations and symbolic claims machine-checked
   (SymPy; `symbolic-math` when enabled).

## What good methods writing does

- **Idea before mechanism** — state the key idea in plain language before
  formalizing it. If the idea cannot be said plainly, it is not ready to
  be written.
- **Motivate every component** — each part answers a need ("to handle X,
  we …"), not just a name. Where a choice had real alternatives, say which
  were considered and why they lost — this is where notes and discussions
  pay off.
- **Separate idea from instantiation** — the general construction first;
  the specific configuration (this dataset, these hyperparameters) later,
  from receipts. A reader should be able to re-instantiate differently.
- **Assumptions where they bite** — stated next to the step that needs
  them, with what they buy and what they cost.
- **Proportional depth** — the novel core gets the most space; standard
  machinery compresses to a citation. Detail follows novelty, not effort
  spent.
- **Notation discipline** — matches Preliminaries exactly; drift gets fixed
  once, in one place.

## Angles (reference, not molds)

- `templates/formalization-first.md` — when the design follows from a few
  principles: formalize the problem → name the principles → the
  construction follows.
- `templates/pipeline.md` — when the method is a staged process: per stage,
  the input/output contract and why this design.
- `templates/model-construction.md` — when the work is a model (game or
  decision structure): players → assumptions → solution concept →
  properties.

Most real sections blend angles (a pipeline whose key stage gets the
formalization treatment). Choose by the idea's shape, and walk the user
through the structure you propose and why — use `question` when the
structural call is genuinely theirs.

## Workflow

1. **Gather the reasoning** — brief, notes, prior decisions; ask the user
   for the "why" where only they have it.
2. **Propose a structure** — from the material, informed by the angles;
   discuss it with the user before drafting.
3. **Draft** — idea first, motivation per component, assumptions inline;
   receipts for every empirical detail.
4. **Consistency pass** — promises kept, notation aligned, no unreceipted
   detail (TODO instead).
5. **Verify** — `latex-compile`.
6. **Report to the outline** — when `outline.md` exists, mark this section
   `done` with a one-line note; if the draft moved any promise, patch the
   promise map and tell the user what changed.

## Done when

- A reader can restate the key idea and why the construction follows from
  it.
- Every component is motivated; real alternative choices recorded with
  their reasons.
- Every empirical detail traces to a receipt (or a visible TODO); formal
  claims machine-checked.
- The promise map is satisfied for this section; `latex-compile` passes.

## Rules

- No invented rationale and no invented details — ask the user for the
  reasoning; mark missing receipts as TODO.
- Structure serves the idea — never force the material into an angle.
