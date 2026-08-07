#!/usr/bin/env python3
"""verify_tensor.py — symbolic tensor verification for a concrete metric.

Usage: copy into the project, replace the CLAIM section (coordinates and
metric components), run inside the project venv (or via experiment-run).
Exits non-zero when a claim fails, so it can gate a manuscript step.

Covers the symbolic layer of differential geometry: Christoffel symbols
from the metric, metric compatibility (nabla g = 0), Ricci tensor and
scalar curvature. Riemann sign conventions differ across the literature —
this template uses  R^l_{ikj} = d_j Gamma^l_{ik} - d_k Gamma^l_{ij} + ... ;
record your convention next to the result.

Soft scale limit: dimension <= 3-4. Christoffel counts grow like n^3 and
simplify() blows up — beyond 4D, verify numerically at random interior
points instead (see references/connections-curvature.md). Seconds on CPU.
"""

import sys

import sympy as sp


def main() -> int:
    # --- 1. The claim: a concrete metric on a chart --------------------------
    # Example: unit sphere S^2 in spherical coordinates (theta, phi),
    # g = diag(1, sin^2 theta). Claimed: Ricci = g (sectional curvature 1),
    # scalar curvature = 2, Levi-Civita connection metric-compatible.
    th, ph = sp.symbols("theta phi", positive=True)
    coords = [th, ph]
    g = sp.diag(1, sp.sin(th) ** 2)
    ginv = sp.simplify(g.inv())
    n = len(coords)

    # --- 2. Christoffel symbols of the second kind ---------------------------
    # Gamma[k][i][j] = Gamma^k_{ij} = (1/2) g^{kl} (d_i g_{jl} + d_j g_{il}
    #                                                         - d_l g_{ij})
    Gamma = [
        [
            [
                sp.simplify(
                    sum(
                        ginv[k, l]
                        * (
                            sp.diff(g[l, j], coords[i])
                            + sp.diff(g[i, l], coords[j])
                            - sp.diff(g[i, j], coords[l])
                        )
                        for l in range(n)
                    )
                    / 2
                )
                for j in range(n)
            ]
            for i in range(n)
        ]
        for k in range(n)
    ]

    # --- 3. Claim A: metric compatibility  nabla_k g_{ij} = 0 ----------------
    compat_ok = True
    for k in range(n):
        for i in range(n):
            for j in range(n):
                # Escalate past simplify: metric terms are trigonometric,
                # and plain simplify can miss the cancellation.
                nab = sp.trigsimp(
                    sp.diff(g[i, j], coords[k])
                    - sum(Gamma[l][k][i] * g[l, j] for l in range(n))
                    - sum(Gamma[l][k][j] * g[i, l] for l in range(n))
                )
                if nab != 0:
                    compat_ok = False
    print(f"metric compatibility (nabla g = 0): {'PASS' if compat_ok else 'FAIL'}")

    # --- 4. Claim B: Ricci tensor --------------------------------------------
    # R_{ij} = d_k Gamma^k_{ij} - d_j Gamma^k_{ik}
    #          + Gamma^k_{ij} Gamma^l_{kl} - Gamma^l_{ik} Gamma^k_{jl}
    Ric = [
        [
            sp.simplify(
                sum(sp.diff(Gamma[k][i][j], coords[k]) for k in range(n))
                - sum(sp.diff(Gamma[k][i][k], coords[j]) for k in range(n))
                + sum(
                    Gamma[k][i][j] * Gamma[l][k][l]
                    for k in range(n)
                    for l in range(n)
                )
                - sum(
                    Gamma[l][i][k] * Gamma[k][j][l]
                    for k in range(n)
                    for l in range(n)
                )
            )
            for j in range(n)
        ]
        for i in range(n)
    ]
    ricci_ok = all(
        sp.simplify(Ric[i][j] - g[i, j]) == 0 for i in range(n) for j in range(n)
    )
    print(f"Ricci = (n-1) K g with K=1:       {'PASS' if ricci_ok else 'FAIL'}")

    R = sp.simplify(sum(ginv[i, j] * Ric[i][j] for i in range(n) for j in range(n)))
    scalar_ok = R == 2
    print(f"scalar curvature R = 2:           {'PASS' if scalar_ok else 'FAIL'}"
          f"  (computed: {R})")

    # --- 5. Numeric probe at interior chart points ---------------------------
    # Pure algebra can survive a sign-convention slip; evaluate somewhere
    # concrete (away from the poles, where this chart is singular).
    import math

    th0 = math.pi / 3
    r_phph_claimed = math.sin(th0) ** 2
    r_phph_computed = float(Ric[1][1].subs({th: th0, ph: 0.0}))
    probe_err = abs(r_phph_computed - r_phph_claimed) / max(1.0, abs(r_phph_claimed))
    probe_ok = probe_err < 1e-12
    print(f"numeric probe at theta=pi/3:      {'PASS' if probe_ok else 'FAIL'}"
          f"  (rel err {probe_err:.2e})")

    ok = compat_ok and ricci_ok and scalar_ok and probe_ok
    print(f"\n{'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
