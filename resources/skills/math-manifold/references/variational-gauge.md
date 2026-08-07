# Variational Principles and Gauge Checks

## Euler–Lagrange residuals

Claim: x(t) extremizes S[x] = ∫ L(t, x, ẋ) dt. The verifiable form:

d/dt(∂L/∂ẋ) − ∂L/∂x = 0 at sampled times

- Take the time derivative of the *claimed curve as implemented* —
  analytic derivatives if available, central differences otherwise
  (tolerance then sits at the O(h²) floor, ~1e-8 for h = 1e-4).
- Sample times away from the integration endpoints when using finite
  differences.
- Field-theory version (L depending on several independent variables):
  the EL equation gains one term per variable; the residual pattern is
  identical.

## Action stationarity by perturbation

A claimed extremum must satisfy S[x + εη] − S[x] = O(ε²) for every
compactly supported perturbation η:

- Pick η that vanishes at the endpoints and is **not itself a solution
  direction** — perturbing along another solution passes trivially and
  proves nothing.
- Run ε over 2–3 orders of magnitude (1e-1, 1e-2, 1e-3). Stationarity
  shows as |ΔS|/ε² **constant** across ε (the constant is the second
  variation — it need not be small). A surviving first-order term shows
  as the ratio blowing up like 1/ε as ε shrinks.
- A single ε proves nothing: truncation can fake stationarity at one
  scale.

## Gauge equivariance: f(g·x) = g·f(x)

The verifiable form of most bundle claims in ML and physics
implementations:

1. **Sanity-check the group sampler first** — sampled elements must
   satisfy the group axioms you rely on (R Rᵀ = I, det R = 1 for SO(3)).
   A broken sampler verifies nothing. Axis-angle (Rodrigues) is enough
   at verification scale.
2. Probe across **magnitude regimes** of x (1e-3, 1, 1e6) — equivariance
   bugs hide in normalization and broadcasting.
3. Report the worst error; if the implementation is only approximately
   equivariant (learned models), the number *is* the result — report it,
   don't force a PASS.

## Curvature of a connection

For matrix-Lie-group connections (su(2), so(3) — 2×2 / 3×3 matrices):

- F_μν = ∂_μ A_ν − ∂_ν A_μ + [A_μ, A_ν] — symbolic in low dimension
  (`verify_tensor.py` pattern with matrix components), numeric at
  sampled points otherwise.
- **Bianchi identity** DF = 0: ∂_ρ F_μν + [A_ρ, F_μν] + cyclic(ρμν) = 0 —
  expand and check. This catches wrong bracket signs and wrong covariant
  derivative conventions.
- Gauge transform behavior: under g(x), A → gAg⁻¹ − (dg)g⁻¹ and
  F → gFg⁻¹. If an implementation applies gauge transforms, verify F
  transforms covariantly at sampled group elements — the same pattern as
  equivariance, one level up.

## Parallel-transport form of bundle claims

| Abstract object | Computable check |
| --- | --- |
| Connection on a principal bundle | parallel-transport ODE; loop closure defect |
| Curvature Ω | small-loop holonomy ≈ Ω · area (scaling test) |
| Covariant derivative | product rule vs finite difference of a section |
| Gauge invariance of an observable | observable(g·x) = observable(x) at sampled g |

The pattern throughout: the abstract object enters only through a
concrete local representative, and the check is a residual, a scaling
law, or an equivariance — never a statement about "all" connections.
