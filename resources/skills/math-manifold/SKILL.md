---
name: math-manifold
description: Use when verifying novel or uncertain differential-geometry claims about a concrete structure — a given metric, connection, chart, Lie group, or local bundle presentation — including Christoffel/Riemann/Ricci identities, metric compatibility and torsion, geodesic and exp/log map checks, parallel transport and holonomy, Euler-Lagrange and action-stationarity residuals, gauge equivariance, curvature of a connection, and symplectic closedness, via symbolic tensor computation in low dimension plus seeded numeric probes with PASS/FAIL exit codes. Not for restating established textbook or literature geometry (cite them), abstract existence/uniqueness/classification theorems, flat Euclidean checks without geometric structure (math-numeric), or non-geometric symbolic identities (symbolic-math).
license: MIT
---

# Math Manifold

Differential geometry derivations fail quietly: a dropped index, a wrong
sign in a Christoffel symbol, a connection that is not quite
metric-compatible. This skill covers the **verification family of
differential geometry** — Riemannian and pseudo-Riemannian geometry,
connections and curvature, geodesics, parallel transport and holonomy,
fiber bundles and gauge fields, variational principles, symplectic
structure — with one discipline: **the claim must be about a concrete
structure and must reduce to tensor components or ODEs**. Then the same
loop as every math skill applies: claim → script → PASS/FAIL exit code →
manuscript note.

Two layers, one skill:

- **Symbolic layer (SymPy)** — tensor components in closed form for
  manifolds of dimension ≤ 3–4: Christoffel from metric, Riemann/Ricci,
  metric compatibility, torsion, curvature 2-forms of matrix-group
  connections, dω for a symplectic form.
- **Numeric layer (numpy)** — anything that integrates or samples:
  geodesic ODE residuals, conservation of g(ẋ, ẋ), parallel transport,
  holonomy vs enclosed curvature, action stationarity, gauge equivariance.

## When to use

Reach for this skill when the geometric claim is **new or uncertain** in this
project — proposed in discussion, not yet established, or tied to **your**
metric/connection/implementation — and it is about a **concrete** structure
(chart + components) that reduces to tensors or ODEs:

- **Your** metric or connection in coordinates: verify claimed Christoffel /
  Riemann / Ricci / scalar curvature, or that a **proposed** metric solves
  an equation (e.g. your ansatz for constant curvature)
- Verify **your** connection is metric-compatible (∇g = 0) and torsion-free
  when the components were derived or coded, not quoted from a textbook
- Check a **claimed** geodesic, exp/log map, or implementation against the
  geodesic equation; conservation of the norm along geodesics
- Parallel transport or holonomy for **your** connection around a specified
  loop (local computational content, not the global theorem statement)
- Variational claims: a **proposed** solution satisfies Euler–Lagrange
  (residual ≈ 0); action stationarity at **your** extremum
- Gauge / bundle claims on a concrete group: **your** layer's equivariance
  f(g·x) = g·f(x); **your** A and claimed F = dA + A∧A; Bianchi for **your**
  components
- Symplectic claims for **your** 2-form or map: dω = 0, ω preservation
- ML on manifolds: **your** Riemannian gradients, retractions vs exponential
  maps, geodesic losses on sphere / hyperbolic / SO(3) / SPD implementations

Standard formulas for a well-known manifold (unit sphere Christoffels, flat
Minkowski, hyperbolic metric in standard coordinates) are **citations** —
verify only the **novel coupling** (new loss, new connection, new chart glue,
implementation) unless the human explicitly asks to re-derive the standard
piece.

## When NOT to use

- **Established results** — textbook Christoffel/Riemann tables, named
  metrics, standard gauge identities, and literature formulas with known
  derivations. Cite the source; do not re-run scripts on what is already
  settled.
- **Human override only** — re-derive or re-probe a standard geometric
  formula when the human explicitly asks.
- **Abstract theorems** — existence/uniqueness of Levi-Civita connections,
  bundle classification, characteristic classes as theorems, "this structure
  satisfies the axioms". Cite the literature; formal proof is `math-formal`
  (deferred).
- **Flat Euclidean numeric checks without geometric structure** — matrix
  identities, ordinary gradient-vs-autodiff → `math-numeric`. Rule of thumb:
  if the claim never mentions a metric, connection, or chart, it is not this
  skill.
- **Non-geometric symbolic identities** (calculus, algebra, ODEs without
  geometric structure) → `symbolic-math`.
- **Statistical claims** → `statistical-rigor`.

## Runtime profile

- **Tier:** fast-verify — scripts finish in seconds on CPU. Symbolic layer
  limited to dimension ≤ 3–4 (Christoffel counts grow like n³; beyond
  that, go numeric). Numeric layer: thousands of integration steps,
  hundreds of probes.
- **Dependencies:** numpy + SymPy. One-time per project:
  `uv pip install -r requirements-verify.txt` into `.prismnext/.venv` —
  never the system Python.
- **Why only these two:** both install as plain wheels into the project
  venv, matching the family's dependency discipline. Beyond that, keeping
  the check on bare numpy/SymPy is a *verification-strength* choice: the
  scripts recompute everything from the metric/components, so the check
  stays independent of whatever library (geomstats, geoopt, …) the claim's
  implementation itself uses — verifying a geomstats-based claim *with*
  geomstats would be circular. If the user's code already uses such a
  library, import it in the check only as the object under test, never as
  the reference. xAct / Cadabra stay documentation pointers. SageMath is
  the one optional step up: never installed into the venv, but when the
  user's machine already has it, SageManifolds extends the symbolic layer
  past dimension 3–4 via the dual-lane pattern in
  `references/sage-backend.md` (`experiment-run interpreter="external"
  pythonPath="sage"`; provenance grade R1) — the independence rule still
  applies (never verify a SageManifolds implementation with SageManifolds).
- **Device:** CPU. For ML-manifold checks against a CUDA implementation,
  verify on CPU first and report `device=` in stdout for both.

## Boundaries

math-manifold is the differential-geometry member of the math skill family
(`math-*`), covering both the symbolic-tensor and numeric-geometric layers
(the former `math-diffgeo` plan is merged here):

| Claim type | Skill | Status |
| --- | --- | --- |
| Symbolic identities, calculus, small linear algebra, ODEs | `symbolic-math` | bundled |
| Purely numerical checks without geometric structure | `math-numeric` | bundled |
| Differential geometry of concrete structures — tensors, geodesics, transport/holonomy, variational, gauge | **math-manifold** (this skill) | bundled |
| Rings, ideals, lattices, polynomial quotients, LLL | `math-lattice` | bundled |
| Structure theorems (existence, uniqueness, classification) | `math-formal` (proof assistant), or cite the literature | deferred |
| Commutative diagrams, bundle schematics | `figure-tikz` — draws, does not verify | bundled |

A claim can chain skills: derive the closed form with `symbolic-math`,
verify its geometric content here, and check its flat-space numerics with
`math-numeric`. Say in the manuscript block which layer verified what.

## Files in this skill

Read on demand:

- `references/connections-curvature.md` — Christoffel from metric, metric
  compatibility and torsion, Riemann/Ricci formulas and index conventions,
  curvature 2-forms, symplectic closedness; symbolic scale limits.
- `references/maps-transport.md` — geodesic ODE and its residuals,
  conservation laws as checks, parallel-transport ODE, holonomy vs
  enclosed curvature, probe design near chart boundaries and poles.
- `references/variational-gauge.md` — Euler–Lagrange residuals, action
  stationarity by perturbation, gauge equivariance checks, F = dA + A∧A
  for matrix groups, Bianchi identity.
- `references/sage-backend.md` — optional SageMath heavy lane: dual-lane
  wrapper pattern, external-interpreter invocation, independence and
  provenance rules.
- `scripts/verify_tensor.py` — symbolic: Christoffel/Ricci/scalar from a
  given metric + metric compatibility (unit-sphere example).
- `scripts/verify_geodesic.py` — numeric: claimed geodesic satisfies the
  geodesic equation; integrated geodesics conserve g(ẋ, ẋ).
- `scripts/verify_holonomy.py` — numeric: parallel transport around a loop;
  defect angle ≡ enclosed curvature (mod 2π).
- `scripts/verify_variational.py` — numeric: Euler–Lagrange residual and
  quadratic action-stationarity of a claimed extremum.
- `scripts/verify_gauge.py` — numeric: group equivariance
  f(g·x) = g·f(x) with sampled group elements.
- `templates/geometry-claim-block.md` — manuscript block: structure,
  chart, layer (symbolic/numeric), probes, worst error, script path.

## Workflow

1. **Fix the concrete structure** — manifold and chart, metric or
   connection components, group action. A claim about "some connection" is
   not verifiable; a claim about *these* components is.
2. **Choose the layer** — closed-form tensor claim in low dimension →
   symbolic (`verify_tensor.py` pattern); anything integrated, sampled, or
   implemented in code → numeric. Read the matching reference file first.
3. **Copy the script into the experiment island**, fill in the CLAIM
   section, run via `experiment-run`. Exit 0/1 gates the manuscript step.
   If imports fail: `uv pip install -r requirements-verify.txt`.
4. **Mind the chart** — probes must respect chart boundaries, poles, and
   coordinate singularities; a check that wanders off the chart verifies
   nothing. See `references/maps-transport.md`.
5. **Report per layer** — symbolic results may be stated as verified
   (given the components); numeric results follow the honesty contract:
   "numerically verified" with domain, probes, seed, worst error. Present
   via `templates/geometry-claim-block.md`.

## Done when

- Script exits 0 via `experiment-run`, seed recorded for numeric layers.
- Symbolic checks include a numeric probe at interior chart points (a
  sign-convention error can survive pure algebra).
- Numeric checks respect the chart: no probe crosses a pole, cut locus, or
  coordinate singularity unless the claim is about exactly that.
- The manuscript block names the concrete structure, the layer(s), and
  worst-case error with tolerance.
- The verification script stays next to the experiment island.

## Rules

- Concrete structures only. "The Levi-Civita connection exists" is a
  citation; "Γᵏᵢⱼ for this metric equals this formula" is a script.
- Index conventions are claims too — record the Riemann sign convention
  next to the result; conventions differ by sign across the literature.
- Symbolic layer caps at dimension 3–4; beyond it, verify numerically at
  random points rather than letting SymPy explode.
- A numeric pass on one chart is evidence on that chart — say which chart.
- Conservation laws (g(ẋ,ẋ) along geodesics, energy along EL solutions)
  are the cheapest strong check: always include one when available.
- Established theorems and standard coordinate formulas are cited, not
  re-verified; scripts exist for novel or implementation-level claims
  unless the human explicitly asks otherwise.
