#!/usr/bin/env python3
"""verify_geodesic.py — numeric verification of geodesic claims.

Usage: copy into the project, replace the CLAIM section (Christoffel
functions and the claimed geodesic / initial value problem), run inside the
project venv (or via experiment-run). Exits non-zero when a claim fails.

Two complementary checks:
  A. A claimed closed-form curve satisfies the geodesic equation
     x''^k + Gamma^k_{ij} x'^i x'^j = 0 (residual at sampled times).
  B. A numerically integrated geodesic conserves g(x', x') — the cheapest
     strong check in Riemannian geometry; a wrong Christoffel breaks it
     immediately.

Mind the chart: keep probes and integration away from coordinate
singularities (here: the poles, theta = 0 or pi). Seconds on CPU.
"""

import sys

import numpy as np

RTOL = 1e-8
SEED = 0


# --- 1. The claim: unit S^2 in spherical coordinates -------------------------
# Christoffel: Gamma^theta_phiphi = -sin th cos th, Gamma^phi_thetaphi = cot th
def christoffel(th, ph):
    """Returns Gamma as a (2,2,2) array: Gamma[k][i][j] = Gamma^k_{ij}."""
    G = np.zeros((2, 2, 2))
    G[0, 1, 1] = -np.sin(th) * np.cos(th)
    G[1, 0, 1] = G[1, 1, 0] = 1.0 / np.tan(th)
    return G


def geodesic_rhs(_, y):
    """State y = [theta, phi, dtheta, dphi]; geodesic equation as first-order ODE."""
    th, ph, dth, dph = y
    G = christoffel(th, ph)
    v = np.array([dth, dph])
    acc = -np.einsum("kij,i,j->k", G, v, v)
    return np.array([dth, dph, acc[0], acc[1]])


def rk4(f, y0, t0, t1, h):
    # Adjust h to divide the interval exactly — a rounded step count leaves
    # a fractional-step endpoint error that pollutes closure checks.
    n = int(round((t1 - t0) / h))
    h = (t1 - t0) / n
    y = y0.copy()
    t = t0
    for _ in range(n):
        k1 = f(t, y)
        k2 = f(t + h / 2, y + h * k1 / 2)
        k3 = f(t + h / 2, y + h * k2 / 2)
        k4 = f(t + h, y + h * k3)
        y = y + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6
        t += h
    return y


def speed2(y):
    th, _, dth, dph = y
    return dth**2 + np.sin(th) ** 2 * dph**2  # g(x', x')


def main() -> int:
    # --- 2. Claim A: the equator theta = pi/2, phi = t is a geodesic ---------
    # Residual x''^k + Gamma^k_{ij} x'^i x'^j at sampled times (exact zero
    # for this closed form; a real claim carries its own claimed curve).
    worst_res = 0.0
    for t in np.linspace(0.1, 2 * np.pi - 0.1, 50):
        th, ph = np.pi / 2, t
        v = np.array([0.0, 1.0])  # x'
        acc = np.array([0.0, 0.0])  # x''
        G = christoffel(th, ph)
        res = acc + np.einsum("kij,i,j->k", G, v, v)
        worst_res = max(worst_res, float(np.max(np.abs(res))))
    claim_a_ok = worst_res < 1e-12
    print(f"claim A: equator satisfies geodesic eq, worst |residual| = {worst_res:.2e}"
          f"  -> {'PASS' if claim_a_ok else 'FAIL'}")

    # --- 3. Claim B: integrated geodesic conserves g(x', x') -----------------
    # Start on the equator with unit velocity; integrate one full loop.
    y0 = np.array([np.pi / 2, 0.0, 0.0, 1.0])
    ts = np.linspace(0.0, 2 * np.pi, 9)
    worst_drift = 0.0
    s0 = speed2(y0)
    y = y0
    for t0, t1 in zip(ts[:-1], ts[1:]):
        y = rk4(geodesic_rhs, y, t0, t1, 1e-3)
        drift = abs(speed2(y) - s0) / max(1.0, abs(s0))
        worst_drift = max(worst_drift, drift)
    claim_b_ok = worst_drift < RTOL
    print(f"claim B: g(x',x') conserved, worst rel drift = {worst_drift:.2e}"
          f"  -> {'PASS' if claim_b_ok else 'FAIL'}")

    # Closure: one full loop returns to the start point (phi mod 2 pi).
    e_phi = (y[1] - 2 * np.pi) % (2 * np.pi)
    e_phi = min(e_phi, 2 * np.pi - e_phi)
    closure = abs(y[0] - np.pi / 2) + e_phi
    closure_ok = closure < 1e-6
    print(f"closure after one loop:           |err| = {closure:.2e}"
          f"  -> {'PASS' if closure_ok else 'FAIL'}")

    ok = claim_a_ok and claim_b_ok and closure_ok
    print(f"\n{'PASS' if ok else 'FAIL'} (seed={SEED})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
