# Pattern: Notation-first Preliminaries

> Reference pattern, not a mold — adapt, blend, reorder, or depart as the
> material demands. The bar is a section that reads true, not one that
> matches this file.

Best for symbol-heavy theory papers where the reader will keep returning
to the notation.

1. **Notation table** — a `tabular` of every symbol: meaning, type/domain,
   where first used. This table is the contract — later text never
   introduces a symbol missing from it.
2. **Definitions by theme** — grouped definition environments, each with a
   one-line remark on why it is needed (which later section consumes it).
3. **Standing assumptions** — global assumptions stated once, here, and
   referenced by name later ("under (A1)").
4. **A minimal running example** (optional) — if the formalism is dense,
   instantiate it on a tiny case the Methods section will reuse.

Check before done: table and text contain exactly the same symbol set;
every definition remark names its consumer.
