# Algebra claim block template

Use when presenting a verified ring/lattice claim in notes or the
manuscript. Same house style as symbolic-math's derivation block; the
differences are the ring line (the coefficient domain is part of the
claim) and the witness (cofactors, unimodular transform, inverse
element — small enough to reference, and what makes the claim
re-checkable by hand).

---

**Claim.** $x^3 + 2xy^2 - y^3 \in I = \langle x^2,\ xy,\ y^2 \rangle$.

**Ring.** $\mathbb{Q}[x, y]$, lex order. (Membership over $\mathbb{Z}[x,y]$
is a different statement — the coefficient domain is part of the claim.)

**Verification.** Gröbner reduction, remainder $0$; witness cofactors
$f = \sum_i h_i g_i$ printed by the script (script:
`<path>/verify_ideal.py`).

---

**Claim.** $B_2$ generates the same lattice as $B_1$.

**Lattice.** $L \subset \mathbb{Z}^4$, full rank, $\det \mathrm{Gram} = 64$.

**Verification.** Unimodular witness $B_2 = U B_1$ with $U \in
\mathbb{Z}^{4 \times 4}$, $\det U = 1$; Gram determinant invariant under
LLL ($\delta = 0.99$) (script: `<path>/verify_lattice.py`).

---

Rules of thumb:

- The **ring is part of the claim** — $\langle x+y, x-y \rangle
  = \langle x, y \rangle$ holds over $\mathbb{Q}$ and fails over
  $\mathbb{Z}$. The block must say which.
- The **witness** is mandatory: cofactors, transform, coefficient vector,
  or inverse element. A bare "verified by script" is not acceptable here.
- LLL claims carry their $\delta$; norm claims carry their conjugation
  map.
- A claim that failed its check does not get a block; it gets fixed or
  dropped.
