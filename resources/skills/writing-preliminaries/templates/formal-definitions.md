# Pattern: Formal-definitions Preliminaries

> Reference pattern, not a mold — adapt, blend, reorder, or depart as the
> material demands. The bar is a section that reads true, not one that
> matches this file.

Best for math-heavy venues: numbered definition–lemma–remark blocks that
later proofs cite by number.

1. **Environments declared** — definitions, lemmas, remarks in numbered
   theorem environments; numbering consistent with the document class.
2. **Bottom-up order** — base definitions first; each block depends only on
   earlier blocks. No forward references except explicit pointers
   ("used in Section 4").
3. **Assumptions inline** — each lemma carries the assumptions it needs in
   its statement, not in surrounding prose.
4. **Verification** — non-trivial symbolic statements (identities, closed
   forms, derivatives) machine-checked before they get a number (SymPy;
   `symbolic-math` when enabled).

Check before done: dependency order is acyclic; every numbered statement
that can be machine-checked has been.
