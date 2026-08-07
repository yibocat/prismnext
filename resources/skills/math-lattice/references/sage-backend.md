# Sage Backend — optional heavy lane

The light lane (SymPy + fpylll in the project venv) is the default gate.
When a claim outgrows it — class groups, large-degree number fields,
Gröbner bases that do not terminate in seconds — and the user's machine
**already has SageMath**, Sage can extend reach. Sage is never bundled and
never installed into `.prismnext/.venv` (no PyPI path; conda/app installs
are GB-scale and stay a user-level OS decision).

Both patterns keep the family contract: single script in the island,
PASS/FAIL via exit code, witness printed to stdout.

## Pattern A — venv wrapper + subprocess (default)

The verify script itself still runs on the project venv, so the light lane
is always available. When Sage is on PATH, the heavy branch is delegated
to it:

```python
import shutil, subprocess, sys

SAGE = shutil.which("sage")
if SAGE:
    backend = "sage"
    r = subprocess.run(
        [SAGE, "-python", "heavy_part.py"],
        capture_output=True, text=True, check=False,
    )
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        sys.exit(1)
    heavy = parse_witness(r.stdout)      # witness from Sage stdout
else:
    backend = "fallback"                  # fpylll / SymPy light lane
    heavy = light_lane_compute()

print(f"backend={backend}")               # self-report lands in runs.jsonl
```

Rules:

- **Cross-validate when both lanes can compute**: run a small case on the
  light lane and the full case on Sage, or compute both and compare. A
  number that only one engine ever produced is weaker evidence.
- The light lane remains the default gate; Sage is the overflow tier, not
  a replacement baseline. If Sage is absent the script must still pass on
  claims the light lane covers.
- `heavy_part.py` lives next to the wrapper inside the island — same file
  boundary as everything else.

## Pattern B — whole script under Sage

When the computation needs Sage types end-to-end (number-field objects,
function fields), run the entire script on Sage's own Python through the
external interpreter lane:

```
experiment-run  interpreter="external"  pythonPath="sage"
```

- No project-venv ensure, no PATH/`VIRTUAL_ENV` injection; the command
  runs as-is inside the island.
- `runs.jsonl` records `env.interpreter = {kind: "external", path: "sage",
  version: <probed>}` — reproducibility grade **R1** (grade **R2** if the
  version probe failed; then note the Sage version manually in Methods).
- Sage ships SymPy **and** fpylll as standard packages, so the light-lane
  scripts usually also run under `sage -python` — but provenance must then
  say Sage, not the project venv. Do not mix lanes in one run.
- Bash is not a lane: `sage …` invoked through the bash tool under the
  Experiment workspace is blocked by the Python gate (it would bypass
  runs.jsonl entirely). Always go through `experiment-run`.

## What Sage adds (ring/lattice side)

- Class groups, unit groups, and regulators of number fields beyond the
  toy quadratic cases the light lane covers
- Large Gröbner computations via the Singular backend — many variables or
  high degree where SymPy does not finish in seconds
- Function fields and serious algebraic number theory

## Manuscript discipline

- The claim block is unchanged: ring, coefficient domain, witness, script
  path — plus `backend=sage` (and the Sage version) in the notes when the
  heavy lane produced the number.
- A Sage-backed claim is still a *concrete instance* check. "The class
  group of Q(√-5) is Z/2" is verifiable; "class groups are finite" stays
  a citation.
- If the user's own code is Sage-based, the verification script must not
  import the user's module as the reference — recompute independently
  (same object-under-test rule as everywhere in the family).
