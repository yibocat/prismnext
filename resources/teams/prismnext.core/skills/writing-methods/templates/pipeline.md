# Angle: Pipeline Methods

> Reference pattern, not a mold — adapt, blend, reorder, or depart as the
> material demands. The bar is a section that reads true, not one that
> matches this file.

Best for systems-flavored work: the method as a staged pipeline, one
subsection per stage.

1. **Overview figure and paragraph** — the whole pipeline in one diagram
   (architecture figure — `figure-tikz` when enabled) and one paragraph.
2. **Stage subsections** — per stage: input contract → what it does → why
   this design → output contract. A stage without a stated contract is not
   finished.
3. **The joining logic** — how stages interact: what passes between them,
   failure modes at the seams.
4. **Implementation** — frameworks, key hyperparameters, hardware: from run
   receipts only (`experiment-to-methods` when enabled).
5. **Complexity / cost** — what the pipeline costs to run, so the reader
   can plan.

Check before done: contracts compose (stage i's output matches stage i+1's
input); the overview figure matches the text stage-for-stage.
