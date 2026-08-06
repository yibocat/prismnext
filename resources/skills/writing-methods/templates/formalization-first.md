# Angle: Formalization-first Methods

> Reference pattern, not a mold — adapt, blend, reorder, or depart as the
> material demands. The bar is a section that reads true, not one that
> matches this file.

Best for method/theory papers where the design follows from a small set of
principles.

1. **Problem formalization** — the exact objective/constraints the method
   must satisfy (builds on Preliminaries; no new notation without need).
2. **Design principles** — two to four named principles the construction
   obeys (e.g. "no test-set information", "linear-time in n"). These are
   the criteria the reader judges the design by.
3. **The construction** — component by component: the obstacle, the
   principle that resolves it, the resulting mechanism. Derive, do not
   enumerate.
4. **Properties** — what the construction guarantees (complexity,
   invariants, convergence) with proof sketches; machine-check symbolic
   steps.
5. **Instantiation** — the concrete configuration used in experiments, with
   values from run receipts only.

Check before done: every component cites the principle it serves; every
property claim is proven or marked as conjecture.
