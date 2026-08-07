---
name: math-lattice
description: Use when verifying novel or uncertain concrete computations on polynomial rings, ideals, and lattices — Groebner-basis ideal membership and ideal equality, quotient-ring relations, LLL-reduced basis equivalence, lattice vector membership, short-vector bounds, minimal polynomials, norms and units in small algebraic number fields — with SymPy and fpylll scripts producing PASS/FAIL exit codes. Not for restating established textbook or literature algebra (cite them), symbolic identities without ring structure (symbolic-math), numeric matrix checks without lattice structure (math-numeric), or abstract structure theorems (cite them or use a proof assistant).
license: MIT
---

# Math Lattice

Concrete algebra is verifiable: ideal membership, quotient-ring relations,
lattice-basis equivalence, LLL quality, minimal polynomials, norms and
units — each reduces to a finite computation with a definite answer. This
skill is the ring-and-lattice member of the math family, same loop as
always: **claim → script → PASS/FAIL exit code → manuscript note**. SymPy
covers polynomial rings and algebraic numbers; fpylll covers lattices.

## When to use

Reach for this skill when the ring- or lattice-level claim is **new or
uncertain** in this project — proposed in discussion, arising from **your**
construction, or not yet established — and it reduces to a **concrete**
instance with a definite answer:

- **Ideal membership / equality** for **your** ideals — is f in ⟨g₁,…,g_k⟩?
  Do two generating sets **you proposed** give the same ideal? (Gröbner
  reduction)
- **Quotient-ring relations** **you need in the manuscript** — does this
  identity hold in Q[x]/(f), R = Z[x]/(f), or your number ring?
- **Lattice-basis claims** for **your** bases — unimodular equivalence, LLL
  output preserves the lattice (Gram determinant), a claimed vector is in
  the lattice
- **Short-vector claims** for **your** parameters — LLL quality bounds,
  claimed short vectors, lattice-crypto sanity (concrete instances only)
- **Algebraic number theory (small)** for **your** elements — minimal
  polynomial, norm/trace, unit checks in Z[√d]-style rings

Textbook Gröbner exercises or standard LLL lemmas are **citations** — script
only **your** ideal, lattice, or ring element unless the human explicitly
asks to re-check a known example.

## When NOT to use

- **Established results** — textbook ideal memberships, named lattice
  lemmas, standard Gröbner examples, and literature computations with known
  witnesses. Cite them; do not re-run scripts on settled algebra.
- **Human override only** — re-check a standard ring or lattice example when
  the human explicitly asks.
- **Symbolic identities without ring structure** (calculus, elementary
  algebra, ODEs) → `symbolic-math`.
- **Numeric matrix checks without lattice structure** (conditioning,
  factorizations over R) → `math-numeric`. The lattice claim must involve
  **integrality** — otherwise it is not this skill.
- **Structure theorems** — "this is a PID", "the class group is finite",
  "the ideal lattice is well-defined". Cite them; formal proof is
  `math-formal` (deferred). Verifiable means *concrete instances*.
- **Statistics** → `statistical-rigor`.

## Runtime profile

- **Tier:** fast-verify — Gröbner bases in a handful of variables and
  low degree, LLL up to dimension ~50: seconds on CPU. Gröbner complexity
  is doubly exponential in the worst case; if a basis does not appear in
  seconds, shrink the claim (see `references/polynomial-ideals.md`).
- **Dependencies:** SymPy + fpylll. One-time per project:
  `uv pip install -r requirements-verify.txt` into `.prismnext/.venv`.
  **Note:** fpylll's runtime dependency `cysignals` is not always pulled
  automatically — it is listed in the requirements file; keep it there.
- **Not bundled / opt-in external:** SageMath (conda/app, GB-scale; no
  PyPI path) is never installed into the project venv. When the user's
  machine already has Sage, it extends this skill's reach — class groups,
  large-degree number fields, high-dimensional Gröbner — via the standard
  dual-lane pattern in `references/sage-backend.md` (venv wrapper +
  `sage -python` subprocess, or `experiment-run interpreter="external"
  pythonPath="sage"`; provenance grade R1). The light lane stays the
  default gate.

## Boundaries

| Claim type | Skill | Status |
| --- | --- | --- |
| Symbolic identities, calculus, small linear algebra, ODEs | `symbolic-math` | bundled |
| Purely numerical checks without geometric/ring structure | `math-numeric` | bundled |
| Differential geometry of concrete structures | `math-manifold` | bundled |
| Polynomial rings, ideals, lattices, algebraic numbers | **math-lattice** (this skill) | bundled |
| Structure theorems (existence, uniqueness, classification) | `math-formal` (proof assistant), or cite the literature | deferred |
| Commutative diagrams, exact sequences | `figure-tikz` — draws, does not verify | bundled |

## Files in this skill

Read on demand:

- `references/polynomial-ideals.md` — Gröbner workflow: monomial orders,
  coefficient-ring discipline (Q vs Z vs Z_p), membership/equality/
  elimination patterns, and what to do when the basis doesn't terminate.
- `references/lattices.md` — basis equivalence and unimodular transforms,
  Gram-determinant invariance, LLL guarantees and their exact constants,
  membership testing, fpylll API patterns and pitfalls.
- `references/sage-backend.md` — optional SageMath heavy lane: dual-lane
  wrapper pattern, external-interpreter invocation, cross-validation and
  provenance rules.
- `scripts/verify_ideal.py` — Gröbner membership, ideal equality,
  quotient-ring relation (template with a passing example).
- `scripts/verify_lattice.py` — unimodular basis equivalence, LLL Gram
  invariance, vector membership, LLL first-vector bound.
- `scripts/verify_numberfield.py` — minimal polynomial annihilation,
  norm/trace, unit checks in a quadratic ring.
- `templates/algebra-claim-block.md` — manuscript block: ring/lattice,
  coefficient domain, computation, witness, script path.

## Workflow

1. **State the ring exactly** — Q[x,y] is not Z[x,y] is not (Z/p)[x,y].
   Membership answers differ by coefficient ring; record it next to the
   claim. See `references/polynomial-ideals.md`.
2. **Copy the matching script** into the experiment island, fill in the
   CLAIM section, run via `experiment-run`. Exit 0/1 gates the manuscript
   step. Missing imports → `uv pip install -r requirements-verify.txt`.
3. **Produce the witness, not just the bit** — the scripts print the
   cofactors (f = Σ hᵢ gᵢ), the unimodular transform, or the integer
   coefficient vector. The witness goes in the notes; it is what makes
   the claim independently re-checkable.
4. **Report via `templates/algebra-claim-block.md`** — ring, monomial
   order or reduction parameter, witness, script path.

## Done when

- Script exits 0 via `experiment-run`.
- The coefficient ring (and monomial order, for Gröbner claims) is
  recorded next to the result.
- The witness (cofactors / transform / coefficient vector) is printed by
  the script and referenced in the notes.
- Scale stayed in the fast tier — or the claim was shrunk and the block
  says so.

## Rules

- Novel or project-specific instances only — established algebra is cited
  unless the human explicitly asks to re-check.
- Concrete instances only. "Membership holds in this ideal" is a script;
  "this class of ideals is principal" is a citation.
- Coefficient ring is part of the claim — x² + 1 factors over C, is
  irreducible over Q, and the script must know which.
- Never eyeball a lattice-basis equivalence: exhibit U with det ±1 or it
  did not happen.
- LLL output quality depends on δ; record δ (fpylll default 0.99) next to
  any short-vector claim.
- Gröbner non-termination in seconds means the claim is too big — reduce
  variables/degree or change monomial order; do not let it hang
  (`experiment-run` has no hard timeout).
