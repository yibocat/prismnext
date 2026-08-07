# Verification block template

Use when presenting a numerically verified claim in notes or the
manuscript. Same house style as symbolic-math's derivation block; the
difference lives in the verification line — a numeric claim carries
domain, probes, seed, and worst-case error instead of a symbolic check.

---

**Claim.** For all $x, y \in \mathbb{R}^{n}$:
$$\lVert x + y \rVert^2 = \lVert x \rVert^2 + 2\, x^{\top} y + \lVert y \rVert^2$$

**Domain.** $n = 128$; magnitudes $10^{-6}$ to $10^{6}$, plus boundary
cases (zero vectors, collinear pairs, cancellation $y = -x$).

**Verification.** Numerically verified — seeded random probes
($n = 500$, seed 0), worst relative error $4.3 \times 10^{-16}$ against
tolerance $10^{-9}$ (script: `<path>/verify_identity.py`).

---

Rules of thumb:

- The wording is **"numerically verified"** — never "proven", "shown", or
  bare "verified". The method line is what makes it honest.
- The domain line is part of the result — a numeric pass covers the
  probed domain, including its stated boundary, and nothing else.
- Report the **worst** relative error with its tolerance; if the
  tolerance was relaxed (float32, conditioning), say why in one clause.
- The verification script path stays in the block so the claim is
  re-checkable after refactors.
- A claim that failed its check does not get a block; it gets fixed or
  dropped.
