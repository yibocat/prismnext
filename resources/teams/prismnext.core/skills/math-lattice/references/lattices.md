# Lattices

Concrete lattice verification with fpylll + numpy. Convention: the
lattice is the **integer row span** of a basis matrix B.

## Basis equivalence — the fundamental claim

B₁ and B₂ generate the same lattice ⟺ B₂ = U B₁ with U integer,
|det U| = 1. Verification is exhibiting U:

```python
detU = round(np.linalg.det(U.astype(float)))
equivalent = detU in (1, -1)   # U integer by construction
```

Never claim equivalence from "the rows look like combinations" — produce
U or it did not happen.

## Invariants that must not move

- **Gram determinant** det(B Bᵀ): invariant under basis change. After
  *any* transform (LLL, claimed reordering, claimed reduction), compare
  it exactly (round to integer — it is one).
- **Covolume** det(L) = √det(B Bᵀ) for full-rank lattices.
- Any reduction that changes the Gram determinant did not preserve the
  lattice — full stop.

## Membership

v ∈ L(B) ⟺ the rational solution of c B = v is integral:

```python
c = np.linalg.solve(B.T.astype(float), v.astype(float))
member = np.all(np.abs(c - np.round(c)) < 1e-9)
```

For wide or rank-deficient setups use `np.linalg.lstsq` and check the
residual as well. The integer coefficient vector is the witness — print
it.

## LLL: what is guaranteed (δ = 0.99 fpylll default)

For a δ-LLL-reduced basis b₁,…,b_n of L:

- ‖b₁‖ ≤ (4/(4δ−1))^((n−1)/4) · det(L)^(1/n) — with δ = 3/4 this is the
  classic 2^((n−1)/4) factor; δ = 0.99 does strictly better.
- The classic safe bound to check is ‖b₁‖ ≤ 2^((n−1)/2) det(L)^(1/n);
  it must hold a fortiori.
- **Record δ next to any short-vector claim.** "LLL-reduced" without δ
  is not a statement.
- Gram-determinant invariance applies to LLL output — always check it;
  it catches API misuse (row vs column conventions).

## fpylll API patterns and pitfalls

```python
from fpylll import IntegerMatrix, LLL
A = IntegerMatrix.from_matrix([[int(v) for v in row] for row in B])
LLL.reduction(A, delta=0.99)          # in-place
B_red = [[int(v) for v in row] for row in A]
```

- `IntegerMatrix.from_matrix` wants plain ints — cast explicitly; numpy
  int64 values can fail to convert silently in some versions.
- **cysignals**: fpylll's runtime dependency is not always pulled in
  automatically (observed with uv). It is in `requirements-verify.txt`;
  if `import fpylll` dies with `No module named 'cysignals'`, that file
  was not installed — run it, don't hand-patch.
- Rows are lattice vectors; if your source uses columns, transpose
  *before* `from_matrix`, then check the Gram determinant.

## Scale

LLL is polynomial-time — dimension 50 is instant, 200 is fine. What is
*not* in this skill: exact SVP beyond small dimensions (enumeration is
exponential), BKZ trade-offs, and anything that takes minutes. If the
claim needs them, it is an experiment, not a verification — run it as
island work and record the wall-clock.
