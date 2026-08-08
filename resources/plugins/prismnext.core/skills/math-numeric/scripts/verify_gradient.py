#!/usr/bin/env python3
"""verify_gradient.py — check a gradient implementation against finite
differences and the complex-step trick.

Usage: copy into the project, replace the CLAIM section (f and grad_f), run
inside the project venv (or via experiment-run). Exits non-zero when the
gradient is wrong, so it can gate a manuscript step.

Why two methods: central differences have O(h^2) truncation error and need a
careful step size; the complex-step trick has no subtraction cancellation
and is accurate to machine epsilon at h = 1e-100 — but only works for
analytic functions of real inputs implemented in complex-safe code. When
both agree with grad_f, the implementation is right; when they disagree
with each other, suspect the function (kink, branch) before the gradient.

See references/numeric-methods.md for step-size theory and float32 caveats.
Seconds on CPU.
"""

import sys

import numpy as np

SEED = 0
N_POINTS = 20
RTOL = 1e-6  # central differences cannot beat ~1e-6 in float64; see refs


# --- 1. The claim: f and its gradient implementation -------------------------
# Example: Rosenbrock banana — the classic gradient-check trap (large
# condition number near the valley).
def f(x: np.ndarray):
    # No float() cast: the complex-step check feeds complex input through f.
    return np.sum(100.0 * (x[1:] - x[:-1] ** 2) ** 2 + (1.0 - x[:-1]) ** 2)


def grad_f(x: np.ndarray) -> np.ndarray:
    g = np.zeros_like(x)
    g[:-1] = -400.0 * x[:-1] * (x[1:] - x[:-1] ** 2) - 2.0 * (1.0 - x[:-1])
    g[1:] += 200.0 * (x[1:] - x[:-1] ** 2)
    return g


# --- 2. Reference gradients --------------------------------------------------
def grad_central(x: np.ndarray, h: float = 1e-5) -> np.ndarray:
    """Central differences, O(h^2) truncation. h ~ 1e-5 is near-optimal in
    float64 for O(1) x; scale h with |x| for large arguments."""
    g = np.zeros_like(x)
    for i in range(x.size):
        step = h * max(1.0, abs(x[i]))
        xp, xm = x.copy(), x.copy()
        xp[i] += step
        xm[i] -= step
        g[i] = (f(xp) - f(xm)) / (2.0 * step)
    return g


def grad_complex_step(x: np.ndarray, h: float = 1e-100) -> np.ndarray:
    """Complex step: imag(f(x + i h e_j)) / h. No cancellation — accurate to
    machine precision. Requires f to accept complex input (numpy does)."""
    g = np.zeros_like(x)
    for i in range(x.size):
        xc = x.astype(complex)
        xc[i] += 1j * h
        g[i] = np.imag(f(xc)) / h
    return g


def rel_err(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.max(np.abs(a - b) / np.maximum(1.0, np.abs(b))))


def main() -> int:
    rng = np.random.default_rng(SEED)
    worst_c, worst_z = 0.0, 0.0
    for _ in range(N_POINTS):
        x = rng.uniform(-2.0, 2.0, size=5)
        g = grad_f(x)
        worst_c = max(worst_c, rel_err(g, grad_central(x)))
        worst_z = max(worst_z, rel_err(g, grad_complex_step(x)))

    ok = worst_c < RTOL and worst_z < RTOL
    print(f"points: {N_POINTS} (seed={SEED})")
    print(f"worst rel err vs central diff : {worst_c:.3e}")
    print(f"worst rel err vs complex step : {worst_z:.3e}")
    print(f"numeric: {'PASS' if ok else 'FAIL'} (rtol={RTOL})")
    if not ok:
        print("  central & complex-step disagree -> suspect f (kink/branch),")
        print("  both disagree with grad_f     -> suspect grad_f.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
