#!/usr/bin/env python3
"""verify_variational.py — Euler–Lagrange residual and action stationarity
for a claimed extremum of a functional.

Usage: copy into the project, replace the CLAIM section (Lagrangian,
claimed solution, perturbation), run inside the project venv (or via
experiment-run). Exits non-zero when a claim fails.

Two checks:
  A. EL residual: d/dt(dL/dx') - dL/dx = 0 at sampled times, with the time
     derivative taken by central differences of the claimed curve — so the
     check covers the claimed solution as *implemented*, not as recalled.
  B. Stationarity: S[x + eps*eta] - S[x] = O(eps^2) for a perturbation eta
     vanishing at the endpoints. First-order terms must vanish; verify the
     quadratic scaling over several eps, never a single eps.

Seconds on CPU. See references/variational-gauge.md for pitfalls.
"""

import sys

import numpy as np

RTOL = 1e-6
SEED = 0


# --- 1. The claim: harmonic-oscillator action --------------------------------
# L(t, x, x') = (1/2) x'^2 - (1/2) x^2  =>  EL: x'' + x = 0.
# Claimed solution: x(t) = sin t on [0, 2 pi].
def L(x, xd):
    return 0.5 * xd**2 - 0.5 * x**2


def claimed(t):
    return np.sin(t)


def claimed_dot(t):
    return np.cos(t)


def perturbation(t):
    # Vanishes at the endpoints 0 and 2 pi, and is NOT itself an EL solution
    # direction — otherwise the stationarity check passes trivially.
    return np.sin(2 * t)


def action(x_fun, xd_fun, n=20001):
    t = np.linspace(0.0, 2 * np.pi, n)
    vals = L(x_fun(t), xd_fun(t))
    # np.trapezoid exists only in numpy >= 2.0; 1.x calls it trapz.
    trapz = getattr(np, "trapezoid", None) or np.trapz
    return float(trapz(vals, t))


def main() -> int:
    # --- 2. Claim A: EL residual via central differences ----------------------
    h = 1e-4
    ts = np.linspace(0.1, 2 * np.pi - 0.1, 100)
    worst = 0.0
    for t in ts:
        xdd = (claimed(t + h) - 2 * claimed(t) + claimed(t - h)) / h**2
        res = xdd + claimed(t)  # d/dt(dL/dx') - dL/dx = x'' + x
        worst = max(worst, abs(res))
    claim_a_ok = worst < 1e-6  # central-diff truncation O(h^2) ~ 1e-8
    print(f"claim A: EL residual, worst |x'' + x| = {worst:.2e}"
          f"  -> {'PASS' if claim_a_ok else 'FAIL'}")

    # --- 3. Claim B: stationarity scales quadratically ------------------------
    s0 = action(claimed, claimed_dot)
    ratios = []
    for eps in (1e-1, 1e-2, 1e-3):
        ds = abs(
            action(lambda t, e=eps: claimed(t) + e * perturbation(t),
                   lambda t, e=eps: claimed_dot(t) + e * 2 * np.cos(2 * t))
            - s0
        )
        ratios.append(ds / eps**2)
        print(f"  eps={eps:7.1e}  |S[x+eps*eta]-S[x]| = {ds:.3e}  "
              f"(ratio {ratios[-1]:.4f})")
    # Stationarity: a vanishing first variation means ΔS is PURELY quadratic
    # — the ratio |ΔS|/eps^2 is constant across eps (its value is the second
    # variation, which need not be small; a linear term would blow the ratio
    # up like 1/eps as eps shrinks).
    spread = max(ratios) - min(ratios)
    claim_b_ok = spread < 0.05 * max(1.0, abs(ratios[0]))
    print(f"claim B: stationarity O(eps^2), ratio spread = {spread:.2e}"
          f"  -> {'PASS' if claim_b_ok else 'FAIL'}")

    ok = claim_a_ok and claim_b_ok
    print(f"\n{'PASS' if ok else 'FAIL'} (seed={SEED})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
