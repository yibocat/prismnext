# Proposition block template

For theory models in management/decision science. The managerial
implication is part of the result — a proposition without one is
unfinished.

---

**Setup.** Players, actions, information, timing, payoffs. Notation fixed
here and used consistently everywhere after.

**Assumptions.** A1: <...>; A2: <...>. Each assumption gets a one-line
justification (what it buys, what it costs).

**Proposition 1.** *Under A1–A2, <statement>.*

*Proof sketch.* <Key steps; full proof in appendix.> Comparative statics
$\partial x^*/\partial \theta$ verified symbolically (script:
`<path>/verify_derivation.py`, see the `symbolic-math` skill). ∎

**Comparative statics.**

| Parameter $\theta$ | $x^*$ (equilibrium action) | $\pi^*$ (payoff) | Intuition |
|---|---|---|---|
| cost $c$ | $-$ | $-$ | margin compression |
| uncertainty $\sigma$ | $+$ | ambiguous | option value vs risk exposure |

**Managerial implication.** One paragraph: who acts differently because of
this proposition, and what they do. If no one acts differently, the
proposition does not belong in the paper.

---

Rules:

- Verify every comparative static with SymPy before it enters the table —
  sign errors in statics are the most common theory-paper erratum.
- "Ambiguous" is an honest entry; do not force signs that need parameter
  restrictions — state the restriction as an extra assumption or corollary.
- Equilibrium concept named (NE / SPNE / BNE) and existence/uniqueness
  addressed, even if briefly.
