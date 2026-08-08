# Derivation block template

Use when presenting a SymPy-verified derivation in notes or the manuscript.
Delete the verification line for venues where it is unusual, keep it for
preprints and internal notes.

---

**Claim.** For $x \in \mathbb{R}$ and $a > 0$:
$$\int x e^{a x}\,dx = \frac{e^{a x}(a x - 1)}{a^2} + C$$

**Assumptions.** $x$ real, $a$ strictly positive (used in the integration step;
the antiderivative extends to $a < 0$ by the same formula).

**Steps.**
1. Integrate by parts with $u = x$, $dv = e^{a x} dx$.
2. …

**Verification.** Symbolic check `simplify(lhs - rhs) = 0` and numeric
spot-check at the domain boundary (script: `<path>/verify_derivation.py`).

---

Rules of thumb:

- The assumptions line is part of the result — never drop it in notes.
- Long expressions are pasted from `sympy.latex()` output, then notation is
  hand-tuned — never transcribed digit by digit.
- The verification script path stays in the block so the claim is
  re-checkable after refactors.
