# PrismNext Bundled Skills

This directory is the **single source of truth** for the agent skills that ship
with PrismNext. Each skill is a folder: a `SKILL.md` entry point plus optional
`references/`, `templates/`, `scripts/`, and `assets/`.

`manifest.json` is generated from the skills' frontmatter — never edit it by
hand:

```bash
node scripts/export-bundled-skills.mjs
```

---

## Quick start

### In the app

1. **Bundled Core skills** — live under this directory in the app; they are
   referenced in place (not copied into the project). Add them to a team's
   Skills allowlist via team detail **+** when needed.
2. **Install from library** — Settings → Skills → Skill Library installs
   GitHub/registry skills into a writable hangar (default Project Team):
   `.prismnext/agent/teams/project.local/skills/<skill-id>/`.
3. **Invoke in chat** — describe the task and the agent loads the matching
   skill, or pick it explicitly with `/` in the composer.
4. **New chat tab** — after creating or editing a skill, open a new chat tab
   for it to appear (skill lists are session-scoped).
5. **Manage** — Settings → Skills lists skills; self-owned hangar copies can
   be deleted. Core skills are toggled via the owning team's Skills roster.

### Project paths

| Content | Path |
| --- | --- |
| Project custom / library skills | `.prismnext/agent/teams/project.local/skills/<skill-id>/` |
| Legacy flat skills (read/migrate only) | `.prismnext/agent/skills/<skill-id>/` |
| Enabled-state / library sources manifest | `.prismnext/agent/skills-manifest.json` |
| Working documents (analysis, decision records, specs) | `specs/` (a plain folder, not app-managed) |
| Shared Python environment | `.prismnext/.venv` |
| Experiment run records | `.prismnext/experiments/<island-id>/runs.jsonl` |

### How scripted skills run

Skills with `scripts/` usually execute inside an experiment island via
`experiment-run`:

1. The agent copies the script template into the island and fills in the
   claim / data paths.
2. `experiment-run` executes it (Python from `.prismnext/.venv` is injected
   automatically — the system Python is never touched).
3. Scripts report PASS/FAIL via **exit code 0/1**; output lands in
   `runs.jsonl`.

**Performance contract**: verification scripts are designed to finish in
**seconds on CPU**; long training runs are a separate concern. First use of
SymPy / matplotlib requires `uv pip install` into the project venv — skills
that need third-party packages ship a `requirements-verify.txt` (e.g.
`uv pip install -r requirements-verify.txt`).

**External interpreters (opt-in heavy tier)**: `experiment-run` also accepts
`interpreter="external"` + `pythonPath` for scripts that must run on the
user's own interpreter — SageMath, a vendor toolchain python, a conda env.
The external lane skips the project venv entirely (no ensure, no
PATH/`VIRTUAL_ENV` injection), probes `<pythonPath> --version`, and records
the real interpreter in `runs.jsonl` (`env.interpreter`). Using an
absolute-path external python *without* the declaration still runs, but the
gate attaches a guidance warning to the run notes. Reproducibility grades:
**R0** project venv · **R1** external, version probed · **R2** external,
version unknown — Methods prose should name R1/R2 runs as external
environments. Skills never install such interpreters; the user opts in at
the OS level (see `math-lattice/references/sage-backend.md` for the
standard dual-lane pattern).

---

## Design principles

These conventions govern every skill in this directory. They exist so that
skills compose without coupling, and so the agent stays a research partner
rather than a form-filler.

- **Two layers, one discipline.** What must hold every single turn lives in
  the always-on prompt layer (`src/main/prompts/modules/`). Skills are
  loaded **on demand** for a task at hand. Before adding a rule to a skill,
  ask which layer it belongs to.
- **Soft triggers.** No skill "auto-fires" on an event. The model matches
  skills per turn from the frontmatter `description`, or the user picks one
  explicitly with `/`. Descriptions are written for the matcher:
  trigger keywords first, non-obvious scenarios included.
- **Stand-alone contract.** Every skill must work when all its siblings are
  disabled. References to sibling skills are allowed only as routing
  pointers ("that work belongs to X") or optional upgrades with a fallback
  ("use X when enabled, otherwise do the key step inline"). Small critical
  content is inlined, never referenced.
- **Judgment-driven interaction.** Skills do not script interrogations. The
  agent asks via the `question` interaction when a fork genuinely belongs to
  the user. Two gates stay hard: confirm the outline before writing at
  length, and confirm cost before any expensive run.
- **Templates are patterns, not molds.** Files under `templates/` say so
  themselves: adapt, blend, reorder, or depart. They are starting points
  distilled from real artifacts.
- **Notation has two audiences.** Manuscript-bound content (`templates/`,
  anything pasted into notes or the paper) is written in LaTeX
  (`$...$` / `$$...$$`). Agent-facing docs (`SKILL.md`, `references/`) are
  read as raw text and may use plain-text or Unicode notation. Never mix
  the two layers.
- **The `specs/` convention.** Working documents — deep analysis, decision
  records, drafts-in-progress — live in the project's `specs/` folder (a
  plain folder, deliberately not an app feature). The project brief holds
  only what has settled; notes are durable assets and live in the notebook.
- **Tools are always safe to reference.** App tools (`experiment-run`,
  `literature-*`, `latex-compile`, `citation-health`, …) are registered in
  the main process regardless of skill toggles.
- **Math skills: novel claims only.** The `math-*` family (`symbolic-math`,
  `math-numeric`, `math-manifold`, `math-lattice`) shares one epistemic gate:
  verify **new or uncertain** claims from the discussion or **your**
  implementation — not textbook identities, standard coordinate formulas, or
  literature results with known derivations. **Cite** established material;
  run scripts only for what is genuinely at stake in the manuscript. Re-check
  an established formula **only when the human explicitly asks** (human
  override).

---

## The skills

### Ideation

| Skill | What it does |
| --- | --- |
| [idea-lab](idea-lab/SKILL.md) | Open-ended brainstorming: divergence before judgment, literature cross-pollination, a dedicated `ideas/` folder — the only skill whose job is generating ideas |

### Research design & experiments

| Skill | What it does |
| --- | --- |
| [hypothesis-design](hypothesis-design/SKILL.md) | Idea → falsifiable hypothesis: preregistered claims, metrics, stop rules; anti-HARKing |
| [experiment-design-matrix](experiment-design-matrix/SKILL.md) | Design matrix before any run — ablations, factor levels, baselines, seeds, cost estimate confirmed up front |
| [ml-research-protocol](ml-research-protocol/SKILL.md) | ML empirical discipline: multi-seed aggregation, fair baselines, results tables, repro checklist |
| [statistical-rigor](statistical-rigor/SKILL.md) | Test selection, power / sample size, effect sizes, multiple comparisons |
| [management-science-empirical](management-science-empirical/SKILL.md) | Management & decision science empirics: DiD/IV/RDD, behavioral experiments, comparative statics |
| [experiment-to-methods](experiment-to-methods/SKILL.md) | Run records → Methods prose; every number traceable, none invented |

### Mathematics (`math-*`)

**Family rule:** cite established math; script only **novel, uncertain, or
implementation-level** claims unless the human explicitly asks to re-check.

| Skill | What it does |
| --- | --- |
| [symbolic-math](symbolic-math/SKILL.md) | Novel/uncertain symbolic identities → SymPy + LaTeX (calculus, linear algebra, ODEs, new losses) |
| [math-numeric](math-numeric/SKILL.md) | Novel/uncertain numeric checks when symbolic stalls or the claim lives in code: probes, gradients vs FD, convergence order |
| [math-manifold](math-manifold/SKILL.md) | Novel/uncertain concrete geometry: your metric/connection/gauge, geodesics, holonomy, variational residuals |
| [math-lattice](math-lattice/SKILL.md) | Novel/uncertain ring & lattice instances: your ideals, quotient relations, LLL claims, algebraic numbers |

### Figures (`figure-*`)

| Skill | What it does |
| --- | --- |
| [figure-matplotlib](figure-matplotlib/SKILL.md) | Scientific plotting norms and matplotlib templates; colorblind-safe palettes |
| [figure-observable-plot](figure-observable-plot/SKILL.md) | Observable Plot vocabulary — density contours, hexbin, facets, geo — rendered headless to manuscript-grade SVG |
| [figure-tikz](figure-tikz/SKILL.md) | TikZ / pgfplots vector graphics: architecture diagrams, commutative diagrams |
| [figure-pipeline](figure-pipeline/SKILL.md) | Experiment artifacts → reproducible paper figures, wired into the manuscript |
| [figure-interaction](figure-interaction/SKILL.md) | Reopenable figures in the chat side panel; static vs CSV-interactive |

### Writing (`writing-*`)

The writing family shares one rule: **[writing-design](writing-design/SKILL.md)
sets the outline first** (story, sections, promise mapping → `outline.md`),
then each section skill drafts against it. Every section skill stands alone,
but the outline is their common blueprint. Templates inside are reference
patterns — adapt freely.

| Skill | What it does |
| --- | --- |
| [writing-design](writing-design/SKILL.md) | Outline gate before prose: story line, section plan, promise mapping |
| [writing-introduction](writing-introduction/SKILL.md) | Introduction — problem-driven / contribution-first / story-arc patterns; testable promises |
| [writing-preliminaries](writing-preliminaries/SKILL.md) | Preliminaries & notation — notation tables, problem setup, symbol consistency |
| [writing-methods](writing-methods/SKILL.md) | Methods chapter — motivation-driven, flexible structure; clarity of ideas over form |
| [writing-results](writing-results/SKILL.md) | Results / verification & derivations — numbers carry run ids; negative results reported |
| [writing-conclusion](writing-conclusion/SKILL.md) | Conclusion / discussion — closes the Introduction's questions; honest limitations |
| [writing-related-work](writing-related-work/SKILL.md) | Library → Related Work: synthesis narrative, grounded citations |

### Reading & review

| Skill | What it does |
| --- | --- |
| [intensive-reading-notes](intensive-reading-notes/SKILL.md) | Close reading → structured notes with page-level evidence |
| [prisma-systematic-review](prisma-systematic-review/SKILL.md) | PRISMA systematic review: protocol, screening log, 2020 checklist |
| [critical-review](critical-review/SKILL.md) | Reverse-angle deep pass over a manuscript, a published paper, a claim, a decision, or the AI's own output — criticism with fixes, never vibes |
| [manuscript-preflight](manuscript-preflight/SKILL.md) | Mechanical integrity before submission/sharing: compile, citations, figures, anonymization, git snapshot |
| [rebuttal-letter](rebuttal-letter/SKILL.md) | Reviewer points → manuscript changes + point-by-point letter; pushback with staged citations |

### Meta

| Skill | What it does |
| --- | --- |
| [skill-creator](skill-creator/SKILL.md) | Create skills — distilled from a workflow that just worked in conversation, or authored from scratch; multi-file skill anatomy |

---

## Choosing by research stage

### 1. Framing & problem definition

| You want to… | Use | Pairs with |
| --- | --- | --- |
| Brainstorm bold ideas, mine literature for inspiration | idea-lab | hypothesis-design (when the idea settles) |
| Turn a vague idea into a testable hypothesis | hypothesis-design | experiment-design-matrix |
| Theory model + comparative statics (mgmt/econ) | management-science-empirical | symbolic-math |

### 2. Literature

| You want to… | Use | Pairs with |
| --- | --- | --- |
| Close-read papers into structured notes | intensive-reading-notes | Literature module |
| Write a Related Work section | writing-related-work | intensive-reading-notes |
| Run a PRISMA systematic review | prisma-systematic-review | writing-related-work |

### 3. Experiment design & statistics

| You want to… | Use | Pairs with |
| --- | --- | --- |
| Design ablations / an evaluation matrix | experiment-design-matrix | hypothesis-design |
| ML experiments: seeds, baselines, aggregation | ml-research-protocol | statistical-rigor |
| Pick a test, compute power / sample size | statistical-rigor | experiment-design-matrix |
| Causal identification (DiD/IV/RDD/panels) | management-science-empirical | statistical-rigor |

### 4. Mathematics & theory

| You want to… | Use | Notes |
| --- | --- | --- |
| **New** identity from discussion (algebra, integrals, ODEs, series) | symbolic-math | SymPy + probes + LaTeX; cite textbook results |
| **Your** gradient/Jacobian/Hessian formula or implementation | symbolic-math → math-numeric | Symbolic first; numeric if scale binds |
| Large matrix / code-level numeric claim | math-numeric | Worst-case error; not textbook numerics |
| **Your** metric, connection, gauge, geodesic, holonomy claim | math-manifold | Cite standard manifolds; verify novel coupling |
| **Your** ideal, lattice, quotient-ring instance | math-lattice | Cite standard examples; witness required |
| Commutative diagrams, category-style figures | figure-tikz | Drawing, not proof |
| Structure theorems (groups, rings, topology) | — | **Out of scope** — cite or `math-formal` (deferred) |

The math skills form a `math-*` family — `math-numeric`, `math-manifold`,
and `math-lattice` are bundled; `math-formal` (proof assistants) is
deferred. All four share the **novel-claims-only** gate (see Design
principles). See the Boundaries table in
[symbolic-math](symbolic-math/SKILL.md) for the division of labor.

### 5. Figures

Data from experiment runs: figure-matplotlib (how to draw) → figure-pipeline
(wire into the manuscript) → figure-interaction (panel display). When the
figure needs Plot's vocabulary — density contours, hexbin, faceted small
multiples, heatmap cells, geo — figure-observable-plot renders a spec + CSV
to SVG headlessly, then figure-pipeline wires the SVG in like any other.

### 6. Writing & finishing

Start at writing-design (outline), then per section: writing-introduction /
writing-preliminaries / writing-methods / writing-results /
writing-related-work / writing-conclusion. Receipts to prose:
experiment-to-methods. Before sharing: critical-review (content) →
manuscript-preflight (mechanics). Reviews in: rebuttal-letter.

---

## Skill folder anatomy

```
<skill-id>/
  SKILL.md              # entry: frontmatter + When to use + Workflow + Rules
  references/           # manuals, checklists, decision trees — read on demand
  templates/            # prose/figure patterns (patterns, not molds)
  scripts/              # executable helpers (usually via experiment-run)
  assets/               # styles, sample .tex, .mplstyle, …
```

**Progressive disclosure**: invoking a skill loads `SKILL.md`; the agent reads
`references/` or copies `scripts/` only when the task calls for them.

---

## Skills with executable scripts

| Skill | Script | Dependencies | Runs via |
| --- | --- | --- | --- |
| symbolic-math | [verify_derivation.py](symbolic-math/scripts/verify_derivation.py) | SymPy ([requirements-verify.txt](symbolic-math/requirements-verify.txt)) | `experiment-run` |
| math-numeric | [verify_identity.py](math-numeric/scripts/verify_identity.py), [verify_gradient.py](math-numeric/scripts/verify_gradient.py), [verify_convergence.py](math-numeric/scripts/verify_convergence.py) | numpy ([requirements-verify.txt](math-numeric/requirements-verify.txt)) | `experiment-run` |
| math-manifold | [verify_tensor.py](math-manifold/scripts/verify_tensor.py), [verify_geodesic.py](math-manifold/scripts/verify_geodesic.py), [verify_holonomy.py](math-manifold/scripts/verify_holonomy.py), [verify_variational.py](math-manifold/scripts/verify_variational.py), [verify_gauge.py](math-manifold/scripts/verify_gauge.py) | numpy + SymPy ([requirements-verify.txt](math-manifold/requirements-verify.txt)) | `experiment-run` |
| math-lattice | [verify_ideal.py](math-lattice/scripts/verify_ideal.py), [verify_lattice.py](math-lattice/scripts/verify_lattice.py), [verify_numberfield.py](math-lattice/scripts/verify_numberfield.py) | SymPy + fpylll ([requirements-verify.txt](math-lattice/requirements-verify.txt)) | `experiment-run` |
| statistical-rigor | [power_analysis.py](statistical-rigor/scripts/power_analysis.py) | **stdlib only** | `experiment-run` or venv |
| ml-research-protocol | [aggregate_seeds.py](ml-research-protocol/scripts/aggregate_seeds.py) | **stdlib only** | `experiment-run` |
| management-science-empirical | [simulate_did.py](management-science-empirical/scripts/simulate_did.py) | **stdlib only** | `experiment-run` |
| figure-matplotlib | [plot_template.py](figure-matplotlib/scripts/plot_template.py) | matplotlib | `experiment-run` |
| figure-observable-plot | [render_plot.mjs](figure-observable-plot/scripts/render_plot.mjs) | **bundled** @observablehq/plot + jsdom — nothing installs into the venv | `experiment-run` |

Stdlib-only scripts need no installs — good for quick checks. SymPy /
matplotlib scripts install into `.prismnext/.venv` first.
figure-observable-plot runs on the app's bundled Node runtime and resolves
Plot/jsdom from the app's own `node_modules`, so it adds zero dependencies
to the project environment.

---

## Common combinations

| Workflow | Chain |
| --- | --- |
| Blue-sky exploration | idea-lab → hypothesis-design (when an idea settles) → experiment-design-matrix |
| ML paper end-to-end | hypothesis-design → experiment-design-matrix → ml-research-protocol + statistical-rigor → experiment-to-methods → figure-pipeline → manuscript-preflight |
| Management science empirics | management-science-empirical + symbolic-math → statistical-rigor → experiment-to-methods |
| Survey paper | prisma-systematic-review → intensive-reading-notes → writing-related-work |
| Theory + figures | symbolic-math → figure-tikz → manuscript-preflight |
| Self-review rehearsal | critical-review (peer-reviewer expert) → revise → rebuttal-letter |
| Full manuscript | writing-design → section skills → critical-review → manuscript-preflight |

---

## Contributing a new bundled skill

1. Create `resources/teams/prismnext.core/skills/<skill-id>/`; the frontmatter
   `name` must equal the folder name.
2. Frontmatter requires `name` and `description` (third person, "Use
   when…", trigger keywords first; no unquoted `: ` in the value).
3. Register the category (`academic` | `general`) in `CATEGORIES` inside
   `scripts/export-bundled-skills.mjs`.
4. Run `node scripts/export-bundled-skills.mjs` to regenerate
   `manifest.json`.
5. Follow [skill-creator](skill-creator/SKILL.md) and match the depth and
   tone of the existing skills — including the design principles above.

**Quality bar**: one domain per skill; actionable steps over generic advice;
orchestrate app tools; honor the stand-alone contract; scripted skills
declare dependencies and expected runtimes (seconds, CPU).

User-level custom skills live in a project at
`.prismnext/agent/teams/project.local/skills/<skill-id>/` — never in
project-root `.opencode/`, `.agents/`, or the legacy flat
`.prismnext/agent/skills/` tree.

---

## Boundaries (so the wrong skill is not picked)

| Task | In scope | Out of scope |
| --- | --- | --- |
| Symbolic identities (calculus, matrices, closed-form ODEs) | symbolic-math | — |
| Statistical testing & reporting | statistical-rigor | pure symbolic derivation |
| Plotting (matplotlib / Observable Plot / TikZ) | figure-matplotlib, figure-observable-plot, figure-tikz | mathematical proof |
| Structure theorems (groups, rings, topology, bundles) | manual proof or formal tools (not bundled) | symbolic-math |
| Long GPU training | `experiment-run` + islands | math-skill verification scripts |

---

## Related docs

- Skill authoring guide: [skill-creator/SKILL.md](skill-creator/SKILL.md)
- Bundled skills tests: `tests/main/bundled-skills.test.ts`
- App-side sync & OpenCode layout: `.cursor/rules/opencode-and-skills-layout.mdc`
