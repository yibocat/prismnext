#!/usr/bin/env python3
"""verify_identity.py — template for checking an identity numerically.

Usage: copy into the project, replace the CLAIM section (lhs/rhs callables
and the domain sampler), run inside the project venv (or via
experiment-run). Exits non-zero when the claim fails, so it can gate a
manuscript step.

This is the fallback when symbolic checking (symbolic-math) stalls or the
expressions exceed its scale limits — and the primary tool when the claim
lives in code. A numeric pass is evidence over the probed domain, not a
proof: report it as "numerically verified" with domain, probes, and seed.

Soft budget: hundreds of probes, seconds on CPU.
"""

import sys

import numpy as np

SEED = 0
N_PROBES = 500
RTOL = 1e-9  # scale-aware relative tolerance; relax for float32 code (~1e-3)


# --- 1. The claim, as lhs(x) == rhs(x) over a declared domain ---------------
# Example: polarization identity  |x + y|^2 = |x|^2 + 2 x·y + |y|^2  for
# x, y in R^8 — trivial by hand, but the pattern scales to claims that are
# not (products of 50x50 matrices, factorizations, commutators).
def lhs(probe):
    x, y = probe
    return np.sum((x + y) ** 2)


def rhs(probe):
    x, y = probe
    return np.sum(x**2) + 2.0 * x @ y + np.sum(y**2)


# --- 2. Domain: interior sampler + explicit boundary/regime probes ----------
def sample_domain(rng):
    """Interior probes spanning magnitude regimes (small, O(1), large)."""
    for scale in (1e-6, 1.0, 1e6):
        for _ in range(N_PROBES // 3):
            yield rng.normal(size=8) * scale, rng.normal(size=8) * scale


def boundary_probes():
    """Degenerate and adversarial points a random sampler may never hit."""
    z = np.zeros(8)
    e = np.eye(8)[0]
    yield z, z
    yield z, e
    yield e, -e  # cancellation: lhs = 0 exactly
    yield np.full(8, 1e-12), np.full(8, 1e-12)


def main() -> int:
    rng = np.random.default_rng(SEED)
    worst, worst_at = 0.0, None
    n = 0
    for probe in list(boundary_probes()) + list(sample_domain(rng)):
        n += 1
        l, r = lhs(probe), rhs(probe)
        err = abs(l - r) / max(1.0, abs(r))  # relative, with scale floor
        if err > worst:
            worst, worst_at = err, probe

    ok = worst < RTOL
    print(f"probes: {n} (seed={SEED}), worst rel|lhs-rhs| = {worst:.3e}")
    print(f"numeric: {'PASS' if ok else 'FAIL'} (rtol={RTOL})")
    if not ok and worst_at is not None:
        x, y = worst_at
        print(f"  worst at |x|={np.linalg.norm(x):.3e}, |y|={np.linalg.norm(y):.3e}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
