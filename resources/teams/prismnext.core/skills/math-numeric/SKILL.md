---
name: math-numeric
description: Use when verifying a novel or uncertain mathematical claim numerically — matrix or tensor identities too large for symbolic checking, gradient/Jacobian implementations against finite differences, convergence or consistency order of a numerical method, quadrature or ODE-solution residuals — via seeded random probes, worst-case error reporting, and a PASS/FAIL exit code. Not for restating established textbook or literature numerics (cite them), claims that simplify symbolically (symbolic-math), statistical hypothesis testing (statistical-rigor), or training/optimization runs.
license: MIT
---

# Math Numeric

Some claims should not go through SymPy: the expressions are too large, the
claim lives in code (a gradient implementation, a solver), or the object is
a numerical method rather than a formula. This skill is the numeric sibling
of `symbolic-math`, with the same loop — **claim → script → PASS/FAIL exit
code → manuscript note** — but the check is seeded random probes and
worst-case error, not `simplify`. A numerically verified claim is evidence,
not proof; the manuscript must say which.

## When to use

Reach for this skill when the claim is **new or uncertain** in this project —
proposed in discussion, not yet established, tied to **your** implementation,
or too large for a symbolic pass — and a numeric residual or probe is the
right check:

- Matrix/tensor identities **you derived or coded** beyond symbolic scale
  (products, factorizations, eigen-relations, commutators at realistic
  dimensions)
- Checking a gradient, Jacobian, or Hessian **implementation** against finite
  differences or the complex-step trick
- Verifying the claimed convergence/consistency order of **your** numerical
  method or discretization by grid refinement
- Quadrature rules, ODE-solution residuals, discretization identities that
  arose in the work and are not already textbook-settled
- Symbolic claims that outgrew `symbolic-math`'s scale limits — shrink to
  numeric probes instead of fighting `simplify`

## When NOT to use

- **Established results** — textbook numerics, named quadrature rules,
  standard discretization error orders, or literature results with known
  verification. Cite them; do not re-probe what is already settled.
- **Human override only** — re-check an established numeric fact when the
  human explicitly asks.
- **Claims that simplify symbolically** — a `simplify(lhs - rhs) == 0` proof
  is strictly stronger. Try `symbolic-math` first; drop to numeric only when
  it stalls or the scale limits bind.
- **Statistical claims** (tests, power, effect sizes) → `statistical-rigor`.
- **Training or optimization runs** — minutes-to-hours GPU work is
  `experiment-run` island work, not a verification script.

## Runtime profile

- **Tier:** fast-verify — scripts finish in seconds on CPU. Probes are
  hundreds of points, not millions; refinement sequences are 3–4 grids.
- **Dependencies:** numpy only. One-time per project:
  `uv pip install -r requirements-verify.txt` into `.prismnext/.venv` —
  never the system Python. scipy is optional (ODE/integrate helpers); add
  it per project when a claim needs it.
- **Device:** CPU. If the claim involves a CUDA code path, run the same
  check on CPU first and report `device=` in stdout for both.

## Boundaries

math-numeric is the numeric-probe member of the math skill family
(`math-*`). Same loop, different claim encoding:

| Claim type | Skill | Status |
| --- | --- | --- |
| Symbolic identities, calculus, small linear algebra, ODEs | `symbolic-math` | bundled |
| Purely numerical checks — matrix identities, gradients vs autodiff, convergence order | **math-numeric** (this skill) | bundled |
| Differential geometry of concrete structures — tensors, geodesics, transport/holonomy, variational, gauge | `math-manifold` | bundled |
| Rings, ideals, lattices, polynomial quotients, LLL | `math-lattice` | bundled |
| Structure theorems (subgroup, well-definedness, existence/uniqueness) | `math-formal` (proof assistant), or cite the literature | deferred |
| Commutative diagrams, bundle schematics | `figure-tikz` — draws, does not verify | bundled |

If the check involves a **statistical** claim about noisy data rather than a
deterministic mathematical object, that is `statistical-rigor`, not here.

## Files in this skill

Read on demand:

- `references/numeric-methods.md` — the methods manual: finite-difference
  step sizes and the complex-step trick, tolerance discipline (relative vs
  absolute, float32 vs float64), probe design, condition-number warnings,
  convergence-order pitfalls. Read before writing a non-trivial check.
- `scripts/verify_identity.py` — seeded random probes over a declared
  domain, worst relative error, boundary points included. Start identity
  checks from this file.
- `scripts/verify_gradient.py` — gradient/Jacobian implementation vs
  central differences and complex step. Start autodiff checks here.
- `scripts/verify_convergence.py` — grid-refinement order verification for a
  claimed convergence rate.
- `templates/verification-block.md` — manuscript block for a numerically
  verified claim (method, domain, probes, seed, worst error, tolerance).

## Workflow

1. **Encode the claim as callables** — lhs/rhs functions, or f + grad_f, or
   an error-per-grid-size callable. Copy the matching `scripts/verify_*.py`
   into the experiment island and fill in the CLAIM section.
2. **Declare the domain** — region, boundaries, and regimes (small, O(1),
   large magnitudes). A numeric check is only as honest as its domain
   coverage; see the probe-design section of the references.
3. **Run via `experiment-run`** — exit code 0/1 gates the manuscript step.
   If `import numpy` fails, install with
   `uv pip install -r requirements-verify.txt` into `.prismnext/.venv`.
4. **Report the worst case, not the average** — a claim fails where it fails
   worst. The scripts print worst error and its location; that number goes
   in the manuscript block.
5. **Word it honestly** — present via `templates/verification-block.md`:
   "numerically verified (worst rel. error 3e-12 over domain D, n=500
   probes)" — never "proven".

## Done when

- Script exits 0 via `experiment-run`, with fixed seed recorded.
- Probes covered the domain **boundary** and multiple magnitude regimes.
- The reported number is the worst-case relative error, with its tolerance.
- The manuscript block says "numerically verified" with method, domain,
  probe count, and seed — not "proven".
- The verification script stays next to the experiment island, re-checkable.

## Rules

- Novel or implementation-level claims only — established numerics are
  citations unless the human explicitly asks to re-check.
- Symbolic first: if `symbolic-math` can prove it, numeric probing is the
  weaker check — use it only when symbolic stalls, scale limits bind, or the
  claim lives in code.
- Fixed seeds always; a check you cannot reproduce is not a check.
- Relative tolerance with a scale floor (`max(1, |expected|)`), never bare
  absolute error — it misfires on large-magnitude results.
- float32 code (most ML models) needs relaxed tolerances (~1e-3); demanding
  1e-12 from single precision manufactures fake failures. See the references.
- Before blaming an implementation, check conditioning — an ill-conditioned
  problem inflates error legitimately.
- A passing check covers the stated domain only; record the domain next to
  the result, as with assumptions in `symbolic-math`.
