#!/usr/bin/env python3
"""verify_convergence.py — verify the claimed convergence order of a
numerical method by grid refinement.

Usage: copy into the project, replace the CLAIM section (error_at(h) or a
precomputed error table, and the claimed order), run inside the project
venv (or via experiment-run). Exits non-zero when the observed order misses
the claim, so it can gate a manuscript step.

Pitfalls (see references/numeric-methods.md): coarse grids show pre-
asymptotic order; overly fine grids hit the roundoff floor and the order
degrades — that is float64 physics, not a bug. Judge the trend over 3-4
refinements, never a single ratio. Seconds on CPU.
"""

import sys

import numpy as np

CLAIMED_ORDER = 2.0
SLACK = 0.1  # observed order must land within ±SLACK of the claim


# --- 1. The claim: error at grid size h --------------------------------------
# Example: trapezoid rule for ∫_0^1 exp(x) dx is 2nd-order accurate.
def error_at(h: float) -> float:
    n = int(round(1.0 / h))
    x = np.linspace(0.0, 1.0, n + 1)
    approx = h * (0.5 * np.exp(x[0]) + np.sum(np.exp(x[1:-1])) + 0.5 * np.exp(x[-1]))
    exact = np.e - 1.0
    return abs(approx - exact)


# --- 2. Refinement sequence --------------------------------------------------
def main() -> int:
    hs = [1 / 20, 1 / 40, 1 / 80, 1 / 160]
    errs = [error_at(h) for h in hs]

    orders = [
        np.log2(e_coarse / e_fine)
        for e_coarse, e_fine in zip(errs[:-1], errs[1:])
    ]
    print(f"claimed order: {CLAIMED_ORDER}")
    for h, e in zip(hs, errs):
        print(f"  h={h:.5f}  err={e:.3e}")
    print("  observed orders: " + ", ".join(f"{o:.3f}" for o in orders))

    # The finest-grid ratio is the most asymptotic; require it near the claim.
    observed = orders[-1]
    ok = abs(observed - CLAIMED_ORDER) <= SLACK
    print(f"numeric: {'PASS' if ok else 'FAIL'} "
          f"(finest-grid order {observed:.3f}, slack ±{SLACK})")
    if not ok:
        print("  order too low  -> method or implementation does not match claim;")
        print("  order degrades at the finest grid -> roundoff floor, coarsen the")
        print("  sequence or raise precision before concluding anything.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
