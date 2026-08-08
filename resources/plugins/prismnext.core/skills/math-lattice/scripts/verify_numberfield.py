#!/usr/bin/env python3
"""verify_numberfield.py — concrete algebraic-number checks in small
number fields: minimal polynomials, norms/traces, unit witnesses.

Usage: copy into the project, replace the CLAIM section, run inside the
project venv (or via experiment-run). Exits non-zero when a claim fails.

Example ring: Z[sqrt(2)] in K = Q(sqrt(2)). Conjugation sqrt(2) -> -sqrt(2)
is the whole toolkit: norm = u * conj(u), trace = u + conj(u), and a unit
is exactly an element of norm +/- 1 (inverse exhibited, not argued).

Seconds on CPU. For class groups, larger fields, or anything beyond
quadratic-style hand checks, that is SageMath territory — see SKILL.md.
"""

import sys

import sympy as sp

x = sp.symbols("x")
s2 = sp.sqrt(2)


def conjugate(u):
    """Q(sqrt(2)) conjugation: sqrt(2) -> -sqrt(2)."""
    return u.subs(s2, -s2)


def norm(u):
    return sp.simplify(u * conjugate(u))


def trace(u):
    return sp.simplify(u + conjugate(u))


def main() -> int:
    # --- 1. Claim A: minimal polynomial annihilates the element --------------
    # Claim: minpoly of alpha = 1 + sqrt(2) over Q is x^2 - 2x - 1.
    alpha = 1 + s2
    claimed_minpoly = x**2 - 2 * x - 1
    annih = sp.simplify(claimed_minpoly.subs(x, alpha))
    # Cross-check against SymPy's own computation (independent path).
    computed = sp.minimal_polynomial(alpha, x)
    minpoly_ok = annih == 0 and sp.simplify(computed - claimed_minpoly) == 0
    print(f"claim A: minpoly(1+sqrt(2)) = x^2-2x-1")
    print(f"  claimed(alpha) = {annih}, sympy computes {computed}"
          f"  -> {'PASS' if minpoly_ok else 'FAIL'}")

    # --- 2. Claim B: unit with explicit inverse witness ----------------------
    # Claim: u = 1 + sqrt(2) is a unit in Z[sqrt(2)], inverse sqrt(2) - 1.
    u = 1 + s2
    claimed_inv = s2 - 1
    prod = sp.simplify(u * claimed_inv)
    unit_ok = prod == 1
    print(f"claim B: (1+sqrt(2))*(sqrt(2)-1) = {prod}  -> {'PASS' if unit_ok else 'FAIL'}")

    # --- 3. Claim C: norm and trace values -----------------------------------
    # Claim: N(u) = -1 (consistent with unit: norm must be +/- 1), Tr(u) = 2.
    n_u, t_u = norm(u), trace(u)
    norm_ok = n_u == -1 and t_u == 2
    print(f"claim C: N(u) = {n_u} (claimed -1), Tr(u) = {t_u} (claimed 2)"
          f"  -> {'PASS' if norm_ok else 'FAIL'}")

    ok = minpoly_ok and unit_ok and norm_ok
    print(f"\n{'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
