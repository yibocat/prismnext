# Numeric Methods

Condensed manual for numerical verification. The scripts encode these
defaults; read this when a check misbehaves or a claim does not fit the
templates.

## Finite differences — step size is the whole game

For first derivatives of a smooth f in float64 (machine epsilon
ε ≈ 2.2e-16):

| Method | Truncation error | Roundoff error | Near-optimal h |
|--------|------------------|----------------|----------------|
| Forward `(f(x+h) - f(x)) / h` | O(h) | O(ε/h) | √ε·\|x\| ≈ 1e-8 |
| Central `(f(x+h) - f(x-h)) / 2h` | O(h²) | O(ε/h) | ε^(1/3)·\|x\| ≈ 1e-5 |
| Complex step `imag(f(x+ih)) / h` | O(h²) | **none** | h = 1e-100 works |

- Central differences bottom out around **1e-6–1e-8** relative error in
  float64 — demanding tighter tolerances from them manufactures failures.
- Scale h with the argument: `h * max(1, |x_i|)`.
- **Complex step** has no subtraction, so no cancellation — machine-precision
  gradients at absurdly small h. Limits: f must be analytic and its code path
  must be complex-safe (`np.abs`, `np.max`, conditionals on values break it;
  most pure-numpy paths work). Use it as the second opinion: when central
  diff and complex step agree with each other but not with your `grad_f`,
  the implementation is wrong.

## Tolerance discipline

- **Relative with a scale floor**: `|a - b| / max(1, |b|)`. Bare absolute
  error fails on large-magnitude results; bare relative error explodes near
  zero crossings.
- **float32 changes everything.** ML models run in single precision
  (ε ≈ 1.2e-7): expect verification errors ~1e-3–1e-4 for accumulated
  computations, and set tolerances accordingly. When checking a float32
  code path, also run the check in float64 — if it passes in float64 and
  fails in float32 at ~1e-3, the math is right and you are measuring
  precision, not error.
- Report the **worst** error over all probes, never the mean. The mean hides
  the single point where the claim dies.

## Probe design

A numeric check is exactly as strong as its domain coverage:

- **Fixed seed** (`np.random.default_rng(0)`-style) — reproducible or it is
  not a check.
- **Magnitude regimes**: sample at ~1e-6, ~1, ~1e6 scales, and log-spaced in
  between for wide domains. Linear-scale sampling never visits the regimes
  where formulas break.
- **Boundary and adversarial points** a random sampler will never hit:
  zeros, identity/basis vectors, sign cancellations (x, −x), denormals,
  domain edges. Add them by hand.
- **Dimensions**: for matrix claims, include the smallest and the largest
  dimension you intend to claim, plus a non-square case if applicable.

## Conditioning — check it before blaming the implementation

A correct implementation of an ill-conditioned problem produces large
errors legitimately. Before declaring FAIL:

- Linear solves / factorizations: look at `np.linalg.cond(A)`. Relative
  output error up to ~cond(A)·ε is expected even from perfect code.
- Near-singular matrices, near-zero denominators, catastrophic cancellation
  (sums of large opposite terms): either the claim must exclude these, or
  the tolerance must absorb them. Say which in the manuscript block.

## Convergence order — read the trend, not one ratio

- Use **3–4 refinement levels**; a single error ratio proves nothing.
- **Pre-asymptotic**: coarse grids often show a lower order than claimed —
  the asymptotic regime has not kicked in. Refine.
- **Roundoff floor**: once the error approaches ~ε·scale, further refinement
  stops improving and the observed order degrades. That is float64 physics,
  not a bug. If the finest grids show degradation, drop them and judge the
  trend before the floor.
- If the error plateaus well above the roundoff floor, the method has an
  error that does not vanish with h — a modeling or implementation bug, not
  an order issue.

## Honesty contract

Numeric verification supports exactly this sentence and no more:

> Numerically verified: worst relative error X over domain D, n probes,
> seed s, tolerance t.

It does not support "we proved". If the claim needs proof, go back to
`symbolic-math` — or, for structure theorems, the literature.
