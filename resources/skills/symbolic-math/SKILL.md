---
name: symbolic-math
description: Use when deriving, checking, or simplifying symbolic mathematics — algebra, calculus, linear algebra, ODEs — with SymPy verification and LaTeX output that goes straight into the manuscript. Covers math, physics, engineering, and economics derivations.
license: MIT
---

# Symbolic Math

Hand derivations are where silent sign errors and dropped factors live. This
skill's loop: **derive → verify symbolically → spot-check numerically → emit
LaTeX → into the manuscript**. SymPy does the checking; the model does the
mathematics.

## When to use

- Verifying a derivation step before it goes into the paper
- Simplifying / factoring / expanding expressions, solving equations or ODEs
- Differentiating losses, checking gradients, Jacobian/Hessian computations
- Series expansions, limits, integrals with stated assumptions
- Converting a checked expression into LaTeX for the manuscript

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
3. **Spot-check numerically** — substitute concrete values (including edge
   cases: 0, 1, large, negative where allowed). Symbolic pass + numeric pass
   catches assumption bugs that either alone misses.
4. **Emit LaTeX** — `sympy.latex()` for the raw form, then hand-tune
   notation to the manuscript's conventions. Never transcribe a long
   expression by hand — that reintroduces the errors you just removed.
5. **Into the manuscript** — present via `templates/derivation-block.md`;
   keep the verification script next to the experiment island so the claim
   is re-checkable.

## Rules

- A derivation step that was not run through SymPy is a claim, not a result —
  say which one you are giving.
- Record assumptions next to the result; a result without its domain is
  incomplete.
- If SymPy cannot simplify to 0, try `trigsimp`, `powsimp`, `ratsimp`,
  `refine` with assumptions before concluding inequality — see the recipes.
- Numeric checks must include the boundary of the assumption domain.
