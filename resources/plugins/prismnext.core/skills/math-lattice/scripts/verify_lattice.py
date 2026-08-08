#!/usr/bin/env python3
"""verify_lattice.py — concrete lattice verification with fpylll + numpy:
basis equivalence, LLL invariance, vector membership, quality bounds.

Usage: copy into the project, replace the CLAIM section (bases and claimed
vectors), run inside the project venv (or via experiment-run). Exits
non-zero when a claim fails.

Conventions: lattice = integer row span of the basis matrix B. Two bases
generate the same lattice iff B2 = U B1 with U integer and |det U| = 1 —
never eyeball this; exhibit U. The Gram determinant det(B B^T) is a
lattice invariant: any correct basis transform or LLL reduction preserves
it exactly. Seconds on CPU; see references/lattices.md for the bounds.
"""

import sys

import numpy as np
from fpylll import IntegerMatrix, LLL

RTOL = 1e-9
LLL_DELTA = 0.99  # fpylll default; record it next to short-vector claims


def rows_to_matrix(A):
    return np.array([[int(v) for v in row] for row in A], dtype=object)


def in_lattice(v, B):
    """v in row-span_Z(B)? Solve c B = v over Q, require integer c."""
    c = np.linalg.solve(B.T.astype(float), np.array(v, dtype=float))
    return bool(np.all(np.abs(c - np.round(c)) < 1e-9)), np.round(c).astype(int)


def main() -> int:
    # --- 1. The lattice -------------------------------------------------------
    B1 = np.array(
        [[2, 0, 0, 0],
         [0, 2, 0, 0],
         [0, 0, 2, 0],
         [1, 1, 1, 1]],
        dtype=object,
    )
    n = B1.shape[0]

    # --- 2. Claim A: basis equivalence via unimodular transform --------------
    # Claim: B2 generates the same lattice as B1, witnessed by B2 = U B1.
    U = np.array(
        [[1, 2, 0, 0],
         [0, 1, 0, 1],
         [0, 0, 1, 0],
         [0, 0, 0, 1]],
        dtype=object,
    )
    B2 = U @ B1
    detU = round(float(np.linalg.det(U.astype(float))))
    equiv_ok = detU in (1, -1)
    print(f"claim A: B2 = U B1 generates the same lattice")
    print(f"  det(U) = {detU} (must be +/-1)  -> {'PASS' if equiv_ok else 'FAIL'}")

    # --- 3. Claim B: LLL preserves the lattice (Gram determinant) ------------
    A = IntegerMatrix.from_matrix([[int(v) for v in row] for row in B1])
    LLL.reduction(A, delta=LLL_DELTA)
    B_red = rows_to_matrix(A)
    gram = lambda B: round(float(np.linalg.det((B.astype(float) @ B.astype(float).T))))
    g1, g2 = gram(B1), gram(B_red)
    gram_ok = g1 == g2
    print(f"claim B: LLL(delta={LLL_DELTA}) preserves det of the Gram matrix")
    print(f"  det(B1 B1^T) = {g1}, det(B_red B_red^T) = {g2}"
          f"  -> {'PASS' if gram_ok else 'FAIL'}")

    # --- 4. Claim C: claimed vector is in the lattice -------------------------
    v = [3, 5, 7, 9]
    member, coeffs = in_lattice(v, B1)
    print(f"claim C: {v} in L(B1), coefficients {list(coeffs)}"
          f"  -> {'PASS' if member else 'FAIL'}")

    # --- 5. Claim D: LLL first-vector quality bound ---------------------------
    # ||b1|| <= 2^((n-1)/2) * det(L)^(1/n)  for delta = 3/4-style bounds;
    # with delta = 0.99 the effective constant is better — check the classic
    # 2^((n-1)/2) bound, which must hold a fortiori.
    detL = g1 ** 0.5  # covolume = sqrt(det Gram) for full-rank
    b1_norm = float(np.linalg.norm(B_red[0].astype(float)))
    bound = (2 ** ((n - 1) / 2)) * detL ** (1 / n)
    quality_ok = b1_norm <= bound * (1 + RTOL)
    print(f"claim D: ||b1|| = {b1_norm:.4f} <= 2^((n-1)/2) det(L)^(1/n) = {bound:.4f}"
          f"  -> {'PASS' if quality_ok else 'FAIL'}")

    ok = equiv_ok and gram_ok and member and quality_ok
    print(f"\n{'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
