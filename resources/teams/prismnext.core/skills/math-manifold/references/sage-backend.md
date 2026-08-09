# Sage Backend — optional heavy lane

The light lane (numpy + SymPy in the project venv) is the default gate:
symbolic tensors up to dimension 3–4, numeric ODE/probe checks beyond
that. When a claim outgrows it — symbolic tensor calculus in dimension
5+, differential-forms algebra that explodes SymPy — and the user's
machine **already has SageMath**, SageManifolds can serve as an
independent reference engine. Sage is never bundled and never installed
into `.prismnext/.venv` (no PyPI path; conda/app installs are GB-scale
and stay a user-level OS decision).

Both patterns keep the family contract: single script in the island,
PASS/FAIL via exit code, worst error / witness printed to stdout.

## The independence rule still applies

The light lane's verification strength comes from recomputing everything
from the metric/connection components, independent of the library the
claim's implementation uses. The same rule governs the Sage lane:

- SageManifolds as the **reference** is fine when the object under test
  is the user's own numpy/geomstats/geoopt/hand-rolled code.
- If the user's implementation is itself SageManifolds, do **not** verify
  it with SageManifolds — that is circular. Use the light lane (or a
  from-components SymPy/numpy recomputation) as the reference instead.

## Pattern A — venv wrapper + subprocess (default)

The verify script still runs on the project venv; when Sage is on PATH,
the heavy symbolic branch is delegated:

```python
import shutil, subprocess, sys

SAGE = shutil.which("sage")
if SAGE:
    backend = "sage"
    r = subprocess.run(
        [SAGE, "-python", "heavy_tensor.py"],
        capture_output=True, text=True, check=False,
    )
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        sys.exit(1)
    ref = parse_components(r.stdout)       # reference tensor from Sage
else:
    backend = "fallback"                   # numpy/SymPy light lane
    ref = light_lane_components()

print(f"backend={backend}")                # self-report lands in runs.jsonl
```

Rules:

- **Cross-validate when both lanes can compute**: a symbolic identity
  SageManifolds proves in dimension n should still pass a seeded numeric
  probe on the light lane at random interior chart points — a sign or
  index-convention error can survive pure algebra on either engine.
- The light lane remains the default gate; if Sage is absent the script
  must still pass on claims the light lane covers.
- `heavy_tensor.py` lives next to the wrapper inside the island.

## Pattern B — whole script under Sage

When the computation needs SageManifolds objects end-to-end (abstract
index notation, forms, bundles on concrete presentations), run the whole
script on Sage's own Python through the external interpreter lane:

```
experiment-run  interpreter="external"  pythonPath="sage"
```

- No project-venv ensure, no PATH/`VIRTUAL_ENV` injection; the command
  runs as-is inside the island.
- `runs.jsonl` records `env.interpreter = {kind: "external", path: "sage",
  version: <probed>}` — reproducibility grade **R1** (grade **R2** if the
  version probe failed; then note the Sage version manually in Methods).
- Sage ships SymPy and numpy as standard packages, so light-lane scripts
  usually also run under `sage -python` — but provenance must then say
  Sage, not the project venv. Do not mix lanes in one run.
- Bash is not a lane: `sage …` invoked through the bash tool under the
  Experiment workspace is blocked by the Python gate (it would bypass
  runs.jsonl entirely). Always go through `experiment-run`.

## What Sage adds (geometry side)

- SageManifolds: symbolic tensor calculus past the dimension 3–4 ceiling
  (Christoffel counts grow like n^3), with index-convention control
- Differential forms and curvature 2-forms in higher dimension, concrete
  bundle presentations
- An independent symbolic engine to cross-check the numpy geodesic /
  holonomy / variational numerics when both lanes cover the claim

## Manuscript discipline

- The geometry claim block is unchanged: structure, chart, layer, probes,
  worst error, script path — plus `backend=sage` (and the Sage version)
  in the notes when the heavy lane produced the result. Record which
  engine verified which layer.
- Chart discipline is unchanged: no probe crosses a pole, cut locus, or
  coordinate singularity unless the claim is about exactly that — on
  either engine.
- Concrete structures only: Sage verifying "Γᵏᵢⱼ for this metric" is a
  script; "the Levi-Civita connection exists" stays a citation.
