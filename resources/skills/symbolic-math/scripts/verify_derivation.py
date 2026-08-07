#!/usr/bin/env python3
"""verify_derivation.py — template for checking a symbolic identity with SymPy.

Usage: copy into the project, replace CLAIM with lhs/rhs and assumptions,
run inside the project venv (or via experiment-run). Exits non-zero when the
claim fails, so it can gate a manuscript step.

Soft scale limits (see references/sympy-recipes.md → "Scale and timeouts"):
symbolic matrices <= 3x3, expressions up to a few dozen terms, and the whole
script should finish in seconds on CPU. Beyond that, keep the symbolic part
small and let the numeric probes carry the weight.
"""

import sys

import sympy as sp


def main() -> int:
    # --- 1. Symbols WITH assumptions (domain of the claim) -----------------
    x = sp.symbols("x", real=True)
    a = sp.symbols("a", positive=True)

    # --- 2. The claim, as lhs == rhs ---------------------------------------
    # Example: integration-by-parts result  ∫ x e^{a x} dx = e^{a x}(a x - 1)/a^2
    lhs = sp.integrate(x * sp.exp(a * x), x)
    rhs = sp.exp(a * x) * (a * x - 1) / a**2

    # --- 3. Symbolic check ---------------------------------------------------
    # simplify() must return in seconds. If it stalls, escalate per the recipes
    # (ratsimp -> trigsimp -> powsimp -> refine) or shrink the claim; do not
    # let the script hang — experiment-run imposes no hard timeout.
    diff = sp.simplify(lhs - rhs)
    symbolic_ok = diff == 0
    print(f"symbolic: simplify(lhs - rhs) = {diff}  ->  {'PASS' if symbolic_ok else 'FAIL'}")

    # --- 4. Numeric spot-check, including domain boundaries -----------------
    # Relative tolerance: absolute 1e-9 misfires on large-magnitude results.
    # Hand-picked edge probes; add random interior points for wider domains.
    f_lhs = sp.lambdify((x, a), lhs, "math")
    f_rhs = sp.lambdify((x, a), rhs, "math")
    probes = [(0.0, 1.0), (1.0, 0.5), (-2.0, 3.0), (10.0, 0.1)]
    worst = 0.0
    for xv, av in probes:
        err = abs(f_lhs(xv, av) - f_rhs(xv, av))
        scale = max(1.0, abs(f_rhs(xv, av)))
        worst = max(worst, err / scale)
        print(f"  x={xv}, a={av}: rel|lhs-rhs| = {err / scale:.2e}")
    numeric_ok = worst < 1e-9
    print(f"numeric: {'PASS' if numeric_ok else 'FAIL'}")

    # --- 5. LaTeX for the manuscript ----------------------------------------
    print("\nLaTeX (rhs):")
    print("  " + sp.latex(rhs))

    return 0 if (symbolic_ok and numeric_ok) else 1


if __name__ == "__main__":
    sys.exit(main())
