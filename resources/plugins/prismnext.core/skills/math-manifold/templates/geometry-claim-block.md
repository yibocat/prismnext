# Geometry claim block template

Use when presenting a verified differential-geometry claim in notes or the
manuscript. Same house style as symbolic-math's derivation block; the
differences are the structure/chart line (every geometric claim is about
a concrete structure on a concrete chart) and, for curvature claims, the
sign-convention line.

---

**Claim (symbolic layer).** The round sphere in spherical coordinates has
constant sectional curvature $K = 1$, i.e.
$$\mathrm{Ric} = (n-1)K\, g = g, \qquad R = 2.$$

**Structure.** $S^2$, metric $g = \mathrm{diag}(1, \sin^2\theta)$ in the
chart $(\theta, \varphi)$, poles excluded.

**Verification.** Symbolic (Christoffel $\to$ Ricci $\to$ scalar, all
components simplified to zero), plus numeric probe at $\theta = \pi/3$,
relative error $0.0$ (script: `<path>/verify_tensor.py`).

**Convention.** $R^\ell{}_{ikj} = \partial_j \Gamma^\ell_{ik}
- \partial_k \Gamma^\ell_{ij} + \cdots$ — record the Riemann sign
convention; readers using the opposite convention must be able to
translate in one line.

---

**Claim (numeric layer).** Parallel transport around the latitude
$\theta = \pi/3$ rotates a tangent vector by the enclosed solid angle
$\Omega = 2\pi(1 - \cos\theta_0) = \pi \pmod{2\pi}$.

**Structure.** Unit $S^2$, Levi-Civita connection; loop stays on the
chart, away from the poles.

**Verification.** Numerically verified — RK4 transport ODE ($h = 10^{-4}$),
holonomy angle vs solid angle defect $6.2 \times 10^{-15}$ against
tolerance $10^{-6}$; norm preserved under transport (script:
`<path>/verify_holonomy.py`).

---

Rules of thumb:

- Name the **concrete structure** — components, not "the Levi-Civita
  connection of some metric".
- Symbolic-layer results may be stated as verified *given the
  components*; numeric-layer results follow the honesty contract —
  "numerically verified", never "proven".
- State the chart. A numeric pass covers that chart, not the manifold.
- Curvature claims carry their sign convention. Index conventions are
  part of the claim.
- Long tensor expressions are pasted from `sympy.latex()` output, then
  hand-tuned — never transcribed digit by digit.
- A claim that failed its check does not get a block; it gets fixed or
  dropped.
