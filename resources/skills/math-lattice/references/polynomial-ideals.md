# Polynomial Ideals and Quotient Rings

Gröbner-basis workflow for concrete ideal claims. Import convention:
`import sympy as sp`.

## The coefficient ring is part of the claim

- Q[x, y], Z[x, y], and (Z/p)[x, y] give **different answers** to the same
  membership question. ⟨x+y, x−y⟩ = ⟨x, y⟩ over Q but not over Z (you
  cannot divide by 2). Record the ring next to every claim.
- In SymPy, pass `domain=` when it matters: `sp.groebner(gens, x, y)`.
  For Z/p use `domain=sp.GF(p)`.
- Quotient-ring arithmetic: `sp.rem(f, modulus, x, domain=sp.QQ)` —
  the remainder is the canonical representative in Q[x]/(modulus).

## The three core patterns

**Membership** — f ∈ ⟨g₁,…,g_k⟩ iff the remainder of f under division by
a Gröbner basis is 0:

```python
G = sp.groebner(gens, x, y, order="lex")
quotients, rem = G.reduce(f)
member = (rem == 0)        # quotients are the witness: f = sum(q_i g_i)
```

Always print the cofactors — they are the independently checkable
witness, and they belong in the notes.

**Ideal equality** — ⟨f₁,…⟩ = ⟨g₁,…⟩ iff each generator of each side
reduces to 0 modulo the other side's Gröbner basis. Two one-way
memberships; never compare generating sets by inspection.

**Elimination** (when a claim is "eliminate t from these equations") —
a lex Gröbner basis automatically triangularizes; the elimination ideal
is the subset of basis polynomials not involving t. Expensive but
decisive in 2–4 variables.

## Monomial orders

- `lex` — eliminates variables; slowest; use for elimination claims.
- `grevlex` — fastest in practice; use for membership/equality when you
  do not need elimination.
- The *answer* to membership does not depend on the order; the *time*
  does, by orders of magnitude.

## When the basis does not appear

Gröbner complexity is doubly exponential in the worst case. If
`sp.groebner` does not return in seconds:

1. Switch to `grevlex` if you were using `lex`.
2. Reduce variables (specialize parameters to concrete values — a claim
   about a specific instance does not need symbolic parameters).
3. Reduce degree (homogenize/dehomogenize tricks rarely help; shrinking
   the instance does).
4. If still stuck, say so: report "Gröbner basis did not terminate within
   budget" and weaken the manuscript claim to what *was* verified. Never
   let the script hang — `experiment-run` has no hard timeout.

## Number-field arithmetic without Sage

Quadratic-style fields Q(√d) need no machinery beyond conjugation:

- conjugate: `u.subs(sp.sqrt(d), -sp.sqrt(d))`
- norm N(u) = u·ū; trace Tr(u) = u + ū — both must be **integers** for
  u in the ring of integers of Z[√d]-type elements; that is itself a
  checkable claim.
- unit ⟺ N(u) = ±1 — but exhibit the inverse (u·v = 1) rather than
  arguing from the norm.
- minimal polynomial: `sp.minimal_polynomial(alpha, x)`; verify a claimed
  polynomial by substitution (annihilation) and cross-check against
  SymPy's own result — two independent paths.

Beyond quadratics (class groups, ramification, larger degrees), the
honest pointer is SageMath — optional, per-project, never bundled.
