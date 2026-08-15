---
name: symbolic-math
description: Use when verifying a novel or uncertain symbolic claim — a hypothesis, a conjectured identity or equation proposed in discussion, or a derivation step whose correctness is not already established — with SymPy checking and LaTeX output that goes straight into the manuscript. Not for restating established formulas or literature results with known derivations (cite them, don't re-derive), formal theorem proving, or purely numerical computation.
license: MIT
---

# Symbolic Math

Hand derivations are where silent sign errors and dropped factors live. This
skill's loop: **derive → verify symbolically → spot-check numerically → emit
LaTeX → into the manuscript**. SymPy does the checking; the model does the
mathematics.

## When to use

Reach for this skill when the mathematics is **new or uncertain** — something
that came out of your discussion and has no authoritative derivation to lean
on:

- Verifying a hypothesis, conjectured identity, or equation proposed in the
  conversation before it goes into the paper
- Checking a derivation step whose correctness is not already established
- Simplifying / factoring / expanding novel expressions, solving equations or
  ODEs that arose in the work
- Differentiating new losses, checking gradients, Jacobian/Hessian
  computations for a proposed model
- Series expansions, limits, integrals with stated assumptions
- Converting a checked expression into LaTeX for the manuscript

## When NOT to use

- **Established results** — textbook identities, named theorems, formulas from
  the literature with a known, verified derivation. Cite them and move on;
  re-running SymPy on what is already settled wastes effort and adds nothing.
- **Human override only** — re-check an established formula when the human
  explicitly asks (sanity check, teaching, or disputing a specific source).
- **Purely numerical computation** — no symbolic claim to check.
- **Formal theorem proving** — use a proof assistant, not SymPy.

## Runtime profile

- **Tier:** fast-verify — scripts finish in seconds, well under 30 s on CPU.
  If a check runs longer, shrink the claim (see `references/sympy-recipes.md`
  → "Scale and timeouts").
- **Dependencies:** SymPy only. One-time per project:
  `uv pip install -r requirements-verify.txt` into `.prismnext/.venv` —
  never the system Python.
- **Scale limits (soft):** symbolic matrices ≤ 3×3; expressions up to a few
  dozen terms. Beyond that, verify numerically with random probes instead of
  pushing `simplify`.
- **Device:** CPU. Verification never needs a GPU.

## Boundaries

symbolic-math is the identity-checking member of the math skill family
(naming convention: `math-*`). Siblings share the same loop — claim →
script → PASS/FAIL exit code → LaTeX/note — but encode different claim
types:

| Claim type | Skill | Status |
| --- | --- | --- |
| Symbolic identities, calculus, small linear algebra, ODEs | **symbolic-math** (this skill) | bundled |
| Purely numerical checks — matrix identities, gradients vs autodiff, numeric ODE solutions | `math-numeric` | bundled |
| Differential geometry of concrete structures — tensors, geodesics, transport/holonomy, variational, gauge | `math-manifold` | bundled |
| Rings, ideals, lattices, polynomial quotients, LLL | `math-lattice` | bundled |
| Structure theorems (subgroup, well-definedness, existence/uniqueness) | `math-formal` (proof assistant), or cite the literature | deferred |
| Commutative diagrams, bundle schematics | `figure-tikz` — draws, does not verify | bundled |

If a claim outgrows this skill's scale limits, prefer a numeric probe
(later: `math-numeric`) over forcing SymPy.

## Files in this skill

Read on demand:

- `references/sympy-recipes.md` — the SymPy cookbook: symbols and
  assumptions, simplification, solve/diff/integrate/series, matrices, LaTeX
  output, numeric checks, and the classic pitfalls. Read before writing
  non-trivial SymPy.
- `scripts/verify_derivation.py` — runnable template: symbolic equality
  check + numeric spot-check + LaTeX emission. Start verification scripts
  from this file.
- `templates/derivation-block.md` — manuscript block for presenting a
  verified derivation (claim, assumptions, steps, verification note).

## Workflow

1. **State assumptions explicitly** — symbols real/positive/integer?
   Assumptions change what SymPy (and mathematics) allows. Wrong assumptions
   are the #1 cause of "SymPy can't do it".
2. **Verify symbolically** — copy `scripts/verify_derivation.py` into the
   project, encode lhs/rhs, run via `experiment-run` (or the project venv).
   Equality is `simplify(lhs - rhs) == 0`, never `==` on expressions.
   If `import sympy` fails, install into the project venv only:
   `uv pip install -r requirements-verify.txt` (`.prismnext/.venv`) —
   never the system Python.
   Not every claim is an identity: integrals, ODE solutions, inverses, and
   roots verify by **inverse operation** — see the recipes.
3. **Spot-check numerically** — substitute concrete values (including edge
   cases: 0, 1, large, negative where allowed). Symbolic pass + numeric pass
   catches assumption bugs that either alone misses.
4. **Emit LaTeX** — `sympy.latex()` for the raw form, then hand-tune
   notation to the manuscript's conventions. Never transcribe a long
   expression by hand — that reintroduces the errors you just removed.
5. **Into the manuscript** — present via `templates/derivation-block.md`;
   keep the verification script next to the experiment island so the claim
   is re-checkable.

## Done when

- Symbolic check passed (identity form, or inverse-operation residual zero).
- Numeric spot-check passed, including the boundary of the assumption domain.
- Assumptions are recorded next to the result.
- The verification script stays next to the experiment island, so the claim
  is re-checkable.

## Rules

- Novel or uncertain claims only — established formulas are citations
  unless the human explicitly asks to re-check.
- A derivation step that was not run through SymPy is a claim, not a result —
  say which one you are giving.
- Record assumptions next to the result; a result without its domain is
  incomplete.
- If SymPy cannot simplify to 0, try `trigsimp`, `powsimp`, `ratsimp`,
  `refine` with assumptions before concluding inequality — see the recipes.
- Numeric checks must include the boundary of the assumption domain.
