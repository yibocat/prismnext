#!/usr/bin/env python3
"""verify_holonomy.py — parallel transport around a loop vs enclosed
curvature (the local content of Gauss-Bonnet / Ambrose-Singer).

Usage: copy into the project, replace the CLAIM section (connection, loop,
and the claimed holonomy), run inside the project venv (or via
experiment-run). Exits non-zero when the claim fails.

Claim verified here: parallel-transporting a tangent vector once around
the latitude circle theta = theta0 on the unit sphere rotates it by an
angle congruent to the enclosed solid angle (mod 2 pi) — holonomy equals
integrated curvature. Seconds on CPU.
"""

import sys

import numpy as np

RTOL = 1e-6


# --- 1. The claim: unit S^2, latitude loop at colatitude theta0 --------------
THETA0 = np.pi / 3  # chart-safe: away from both poles
# Enclosed solid angle of the polar cap bounded by the loop:
SOLID_ANGLE = 2 * np.pi * (1 - np.cos(THETA0))


def transport_rhs(_, v):
    """Parallel-transport ODE along the latitude loop phi = t, theta = theta0.

    v = (a, b) are coordinate components wrt (d/dtheta, d/dphi):
      a' = sin(theta0) cos(theta0) b
      b' = -cot(theta0) a
    (from Dv/dt = 0 with Gamma^theta_phiphi = -sin th cos th,
     Gamma^phi_thetaphi = cot th, and x' = (0, 1).)
    """
    a, b = v
    return np.array(
        [np.sin(THETA0) * np.cos(THETA0) * b, -a / np.tan(THETA0)]
    )


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


def main() -> int:
    # --- 2. Transport v0 = d/dtheta once around the loop ----------------------
    v0 = np.array([1.0, 0.0])
    v1 = rk4(transport_rhs, v0, 0.0, 2 * np.pi, 1e-4)

    # Signed rotation angle in the orthonormal frame (d/dtheta, (1/sin th0) d/dphi):
    # physical components of v1 are (a1, b1 * sin(theta0)).
    phys = np.array([v1[0], v1[1] * np.sin(THETA0)])
    angle = np.arctan2(phys[1], phys[0])  # v0 = (1, 0) in this frame

    # --- 3. Claim: angle ≡ enclosed solid angle (mod 2 pi) --------------------
    diff = (angle - SOLID_ANGLE) % (2 * np.pi)
    defect = min(diff, 2 * np.pi - diff)
    norm_ok = abs(np.linalg.norm(phys) - 1.0) < 1e-9  # transport preserves g
    claim_ok = defect < RTOL

    print(f"loop: latitude theta0 = pi/3, v0 = d/dtheta")
    print(f"holonomy angle (signed, mod 2pi): {angle % (2 * np.pi):.8f}")
    print(f"enclosed solid angle:             {SOLID_ANGLE:.8f}")
    print(f"|defect| mod 2pi = {defect:.3e}  -> {'PASS' if claim_ok else 'FAIL'}")
    print(f"norm preserved under transport:   {'PASS' if norm_ok else 'FAIL'}")

    ok = claim_ok and norm_ok
    print(f"\n{'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
