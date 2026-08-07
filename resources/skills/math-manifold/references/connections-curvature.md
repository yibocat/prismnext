# Connections and Curvature

Recipes for the symbolic layer: given a concrete metric or connection in
coordinates, verify its derived tensors. Import convention:
`import sympy as sp`.

## Christoffel from metric

Γᵏᵢⱼ = ½ gᵏˡ (∂ᵢ gⱼₗ + ∂ⱼ gᵢₗ − ∂ₗ gᵢⱼ) — this is *the* computation of
Riemannian geometry; everything else is contractions of it.

```python
# coords: list of sympy symbols; g: sympy Matrix; ginv = g.inv()
Gamma[k][i][j] = sp.simplify(sum(
    ginv[k, l] * (sp.diff(g[l, j], coords[i])
                  + sp.diff(g[i, l], coords[j])
                  - sp.diff(g[i, j], coords[l]))
    for l in range(n)) / 2)
```

`verify_tensor.py` implements this pattern end to end.

## Metric compatibility and torsion

- **∇g = 0**: ∇ₖ gᵢⱼ = ∂ₖ gᵢⱼ − Γˡₖᵢ gₗⱼ − Γˡₖⱼ gᵢₗ must vanish
  identically. Metric terms are trigonometric — escalate to `trigsimp`
  before concluding incompatibility; plain `simplify` misses the
  cancellation (learned on the sphere metric).
- **Torsion-free**: Γᵏᵢⱼ = Γᵏⱼᵢ — for a connection given independently of
  the metric, check the lower-index symmetry directly.
- For a connection given by its own components (not Christoffel of a
  metric), both checks are claims: compute and compare.

## Riemann, Ricci, scalar

Riemann sign conventions differ across the literature. This skill's
scripts use:

R_{ij} = ∂ₖ Γᵏᵢⱼ − ∂ⱼ Γᵏᵢₖ + Γᵏᵢⱼ Γˡₖₗ − Γˡᵢₖ Γᵏⱼₗ   (Ricci)

Record the convention next to any verified curvature claim — a sign slip
here is the single most common differential-geometry error in papers.

Useful checks beyond the components themselves:

- **Constant curvature K**: Ricci = (n−1) K g. Verify as a matrix identity.
- **Einstein metrics**: Ricci = λ g — same pattern.
- **Scalar**: R = gⁱʲ Rᵢⱼ.
- **First Bianchi** for the full Riemann tensor when the claim involves it.

## Curvature of a connection (gauge / bundle setting)

For a matrix-Lie-group connection A = A_μ dxᵘ (components are matrices):

F_μν = ∂_μ A_ν − ∂_ν A_μ + [A_μ, A_ν]

Computable symbolically for 2×2 or 3×3 matrix components (su(2), so(3)).
The **Bianchi identity** DF = 0 becomes ∂_ρ F_μν + [A_ρ, F_μν] + cyclic = 0 —
verify by direct expansion. See `references/variational-gauge.md`.

## Symplectic closedness

For a claimed symplectic form ω (antisymmetric matrix of functions):
dω = 0 is ∂ᵢ ωⱼₖ + ∂ⱼ ωₖᵢ + ∂ₖ ωᵢⱼ = 0 over all index triples. A map
Φ preserves ω iff Jᵀ ω J = ω with J the Jacobian — symbolic in low
dimension, numeric probe otherwise.

## Scale limits — read before running

- Symbolic Christoffel/Ricci: dimension **≤ 3–4**. Count grows like n³ and
  `simplify` blows up. A 4D spacetime metric with symmetry is fine; a
  generic 4D metric is already slow; 6D+ goes numeric.
- Beyond the limit: evaluate all components at random interior chart
  points (fixed seed) and check numerically. Report as numerically
  verified.
- Always add a **numeric probe** even when the symbolic check passes —
  a sign-convention slip can be self-consistent and survive pure algebra.
- Keep probes away from chart singularities (poles in spherical
  coordinates, r = 0 in polar coordinates): the chart itself is undefined
  there, so a failure there says nothing about the geometry.
