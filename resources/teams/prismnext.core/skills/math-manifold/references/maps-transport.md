# Maps, Geodesics, and Transport

Recipes for the numeric layer: anything that integrates an ODE or samples
the manifold. All checks here are numpy-only, seconds on CPU.

## Geodesic equation as verification target

ẍᵏ + Γᵏᵢⱼ ẋⁱ ẋʲ = 0 — two ways to use it:

**A. Claimed closed form.** Sample times, evaluate the claimed curve and
its derivatives (analytic or central differences), and measure the
residual. Exact closed forms give residuals at machine precision; finite
differences contribute their own O(h²) floor — set the tolerance for the
*check method*, not just the claim.

**B. Numerical integration.** Integrate the geodesic ODE from initial
conditions (RK4 is enough at verification scale). Then the strongest
cheap checks are:

- **Conservation of g(ẋ, ẋ)** — any correct Levi-Civita geodesic
  preserves speed; a wrong Christoffel breaks this immediately. Compute
  the drift, not the value.
- **Closure** on symmetric spaces (sphere: great circles close after
  2π). Beware two traps: RK4 step counts must divide the interval
  exactly (a fractional final step shows up as fake non-closure), and
  angles compare **mod 2π** with the wrap-aware distance
  `min(e, 2π − e)`.

## Parallel transport and holonomy

Transport ODE along x(t): v̇ᵏ = −Γᵏᵢⱼ ẋⁱ vʲ. Checks:

- **Norm preservation**: g(v, v) is constant along transport — the
  transport analogue of speed conservation.
- **Holonomy vs curvature**: for a loop bounding a region,
  rotation angle ≡ ∫ K dA (mod 2π) — the local content of
  Gauss–Bonnet / Ambrose–Singer. This is the verifiable form of
  "curvature is the infinitesimal holonomy". `verify_holonomy.py` is the
  template; the signed angle is computed in an *orthonormal* frame
  (coordinate bases are not normalized — divide by √gᵢᵢ first).
- **Path-ordering sanity**: transporting around an infinitesimal loop of
  area A should give a defect ≈ F · A (curvature as generator). Scaling
  the loop down must show the defect shrinking proportionally — a defect
  that doesn't scale is an integration bug, not geometry.

## exp / log maps and retractions (ML implementations)

For a claimed closed-form exp or log on a standard manifold:

- exp_p(0) = p; log_p(p) = 0 — trivial but catches wiring bugs.
- **Round-trip**: log_p(exp_p(v)) = v for small |v|; exp_p(log_p(q)) = q
  for q near p. Sample v in the tangent space across magnitude regimes
  and stay inside the injectivity radius (on Sⁿ: |v| < π — beyond it the
  round trip *should* fail; that is the geometry, not a bug).
- **exp vs geodesic shooting**: exp_p(tv) at t=1 must equal the
  numerically integrated geodesic from (p, v). This catches wrong
  closed forms even when round trips pass (self-consistent but wrong).
- **Retractions** are *not* exp: verify only the retraction axioms
  (R_p(0) = p, DR_p(0) = identity) — do not hold a retraction to
  geodesic accuracy.

## Chart discipline

- Probes stay inside one chart. Crossing a pole, branch cut, or cut
  locus invalidates the check without invalidating the claim.
- Near chart boundaries, errors grow legitimately (cot θ → ∞ at the
  poles). Either restrict the domain or relax the tolerance — and say
  which in the manuscript block.
- Distances: geodesic distance claims on embedded manifolds can be
  cross-checked against the ambient chord distance only with the correct
  conversion (sphere: d = 2 arcsin(chord/2)) — comparing geodesic to raw
  chord distance "approximately" verifies nothing.
