# SymPy Recipes

Condensed cookbook for the operations derivations actually need. Import
convention: `import sympy as sp`.

## Symbols and assumptions

Assumptions gate everything — integrals, square roots, simplifications:

```python
x = sp.symbols("x", real=True)
n = sp.symbols("n", integer=True, positive=True)
lam = sp.symbols("lambda", positive=True)   # rate parameters
# several at once
a, b = sp.symbols("a b", positive=True)
```

Query: `x.assumptions0`. Refine later: `sp.refine(expr, sp.Q.positive(x))`.

## Equality checking — the core operation

`==` on expressions tests *structural* identity, not mathematical equality.
`sp.sin(x)**2 + sp.cos(x)**2 == 1` is `False`. Always:

```python
sp.simplify(lhs - rhs) == 0        # canonical check
sp.equals(lhs, rhs)                # smarter; returns True/False/None
```

If `simplify` stalls, escalate in this order:

```python
sp.ratsimp(expr)      # rational functions first — fast
sp.trigsimp(expr)     # trigonometric identities
sp.powsimp(expr, force=True)   # power rules (force ignores assumptions — only after numeric check)
sp.expand(expr); sp.factor(expr); sp.cancel(expr)
```

## Calculus

```python
sp.diff(f, x)            # derivative; sp.diff(f, x, 2) second order
sp.integrate(f, x)       # indefinite
sp.integrate(f, (x, 0, sp.oo))      # definite — needs assumptions on params
sp.limit(f, x, 0, dir="+-")
sp.series(f, x, 0, 6)              # Taylor to O(x^6); .removeO() to get poly
sp.summation(f, (n, 1, sp.oo))
```

Returns `nan` / unevaluated `Integral` when it cannot decide — usually an
assumption is missing, not that the math fails. Add assumptions, retry.

## Equations and ODEs

```python
sp.solve(x**2 - a, x)                    # list of solutions
sp.solve([eq1, eq2], [x, y])             # systems
sp.nsolve(eq, x, x0)                     # numeric root from guess x0

f = sp.Function("f")
ode = sp.Eq(f(x).diff(x, 2) + f(x), 0)
sp.dsolve(ode, f(x), ics={f(0): 1, f(x).diff(x).subs(x, 0): 0})
```

## Linear algebra

```python
M = sp.Matrix([[1, x], [0, 1]])
M.inv(); M.det(); M.eigenvals(); M.eigenvects()
M.jordan_form(); M.T; sp.trace(M)
sp.Matrix.jacobian  # use: sp.Matrix([f1, f2]).jacobian([x, y])
```

Symbolic inverses and eigenvalues blow up fast — for matrices beyond 3×3,
verify identities numerically with random rational matrices instead.

## Numeric spot-checking

```python
expr.subs({x: 2, a: 3})              # exact substitution
sp.N(expr, 30)                       # 30-digit evaluation
sp.lambdify((x, a), expr, "math")    # callable; "numpy" for arrays
```

Check the *boundary* of the domain (x→0, x→1), not just comfortable values.

## LaTeX output

```python
sp.latex(expr)                       # string for the manuscript
sp.latex(sp.Integral(f, (x, 0, sp.oo)))
sp.print_latex(expr)
```

Settings worth knowing: `sp.latex(expr, mul_symbol="dot")`,
`fold_frac_powers=True`. Always hand-tune symbol names after emission —
SymPy writes `\\lambda` etc. correctly but cannot know your notation.

## Pitfalls that waste hours

- `x, y = sp.symbols("x y")` — without `real=True`, `sp.sqrt(x**2)` will not
  simplify to `x` (complex branch). Give assumptions at creation.
- `1/2` is a Python float; use `sp.Rational(1, 2)` or `sp.S(1)/2`.
- `sp.pi`, `sp.E`, `sp.oo`, `sp.I` — not `math.pi`.
- `sp.log` is natural log; `log(x, 10)` for base 10.
- Equality of integrals/sums with different index names: `simplify` may miss
  alpha-renaming — substitute one symbol for the other first.
- `dsolve` constants are `C1, C2...` — apply `ics` to pin them down.
