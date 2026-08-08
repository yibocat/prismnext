#!/usr/bin/env python3
"""verify_ideal.py — Groebner-basis verification for polynomial ideal
claims: membership, ideal equality, and quotient-ring relations.

Usage: copy into the project, replace the CLAIM section (ring, generators,
and the claimed relation), run inside the project venv (or via
experiment-run). Exits non-zero when a claim fails.

The witness matters as much as the bit: membership f in <g1..gk> comes
with cofactors f = sum(h_i g_i) — print them, reference them in the notes.

Scale discipline: Groebner bases are doubly exponential in the worst case.
Keep to a handful of variables and low degree; if the basis does not
appear in seconds, shrink the claim (see references/polynomial-ideals.md).
Seconds on CPU.
"""

import sys

import sympy as sp


def main() -> int:
    x, y = sp.symbols("x y")

    # --- 1. Claim A: membership ---------------------------------------------
    # Ring: Q[x, y], lex order. Ideal I = <x^2, x y, y^2>.
    # Claim: f = x^3 + 2 x^2 y - y^3  lies in I.
    gens = [x**2, x * y, y**2]
    f = x**3 + 2 * x * y**2 - y**3
    G = sp.groebner(gens, x, y, order="lex")
    rem = G.reduce(f)[1]
    member_ok = rem == 0
    print(f"claim A: {f} in <x^2, xy, y^2> (Q[x,y], lex)")
    print(f"  remainder mod Groebner basis = {rem}  -> {'PASS' if member_ok else 'FAIL'}")

    # --- 2. Claim B: ideal equality by two-way membership --------------------
    # Claim: <x + y, x - y> = <x, y> over Q (FALSE over Z — coefficient ring
    # is part of the claim).
    gens_l, gens_r = [x + y, x - y], [x, y]
    G_l = sp.groebner(gens_l, x, y, order="lex")
    G_r = sp.groebner(gens_r, x, y, order="lex")
    l_in_r = all(G_r.reduce(g)[1] == 0 for g in gens_l)
    r_in_l = all(G_l.reduce(g)[1] == 0 for g in gens_r)
    equal_ok = l_in_r and r_in_l
    print(f"claim B: <x+y, x-y> = <x, y> over Q[x,y]")
    print(f"  left in right: {l_in_r}, right in left: {r_in_l}"
          f"  -> {'PASS' if equal_ok else 'FAIL'}")

    # --- 3. Claim C: quotient-ring relation ----------------------------------
    # In R = Q[x]/(x^3 - 2), claim: (x + 1)(x^2 - x + 1) = 3.
    # (The relation witnesses that x+1 divides 3 in R — x^3 = 2 there.)
    modulus = x**3 - 2
    rel = sp.expand((x + 1) * (x**2 - x + 1)) - 3
    q_rem = sp.rem(rel, modulus, x, domain=sp.QQ)
    quot_ok = q_rem == 0
    print(f"claim C: (x+1)(x^2-x+1) == 3 in Q[x]/(x^3-2)")
    print(f"  remainder mod (x^3-2) = {q_rem}  -> {'PASS' if quot_ok else 'FAIL'}")

    ok = member_ok and equal_ok and quot_ok
    print(f"\n{'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
