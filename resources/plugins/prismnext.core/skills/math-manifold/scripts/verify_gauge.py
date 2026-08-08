#!/usr/bin/env python3
"""verify_gauge.py — group-equivariance verification: f(g.x) = g.f(x).

Usage: copy into the project, replace the CLAIM section (group sampler,
group action, and the map f), run inside the project venv (or via
experiment-run). Exits non-zero when the claim fails.

This is how bundle/gauge claims in ML and physics papers become testable:
"the feature map is SO(3)-equivariant", "the layer commutes with the gauge
action". Sample group elements and points, and compare both orders of
application. A claim that holds only approximately must say so with its
worst-case error.

Seconds on CPU. See references/variational-gauge.md for F = dA + A^A and
Bianchi-identity patterns when the claim is about a connection itself.
"""

import sys

import numpy as np

SEED = 0
N_PROBES = 200
RTOL = 1e-12


# --- 1. The claim ------------------------------------------------------------
# Group: SO(3), acting on R^3 by rotation. Map: radial projection
# f(x) = x / |x| onto the unit sphere. Claim: f(R x) = R f(x) for all
# R in SO(3), x != 0.
def random_rotation(rng):
    """Uniform-ish SO(3) sample via axis-angle (Rodrigues)."""
    u = rng.normal(size=3)
    u /= np.linalg.norm(u)
    ang = rng.uniform(-np.pi, np.pi)
    K = np.array([[0, -u[2], u[1]], [u[2], 0, -u[0]], [-u[1], u[0], 0]])
    return np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * (K @ K)


def f(x):
    return x / np.linalg.norm(x)


def main() -> int:
    rng = np.random.default_rng(SEED)
    worst = 0.0

    # Group sanity: samples must actually be rotations — a broken group
    # sampler verifies nothing.
    for _ in range(10):
        R = random_rotation(rng)
        assert np.allclose(R @ R.T, np.eye(3), atol=1e-12), "R not orthogonal"
        assert abs(np.linalg.det(R) - 1.0) < 1e-12, "det R != 1"

    # --- 2. Probes across magnitude regimes ----------------------------------
    for scale in (1e-3, 1.0, 1e6):
        for _ in range(N_PROBES // 3):
            x = rng.normal(size=3) * scale
            R = random_rotation(rng)
            err = np.max(np.abs(f(R @ x) - R @ f(x)))
            worst = max(worst, err)

    ok = worst < RTOL
    print(f"claim: f(x) = x/|x| is SO(3)-equivariant")
    print(f"probes: {N_PROBES} (seed={SEED}), worst |f(Rx) - R f(x)| = {worst:.3e}")
    print(f"{'PASS' if ok else 'FAIL'} (rtol={RTOL})")
    if not ok:
        print("  equivariance broken — check normalization, broadcasting, and")
        print("  whether the action on the output matches the action on the input.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
