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

1. **Install into a project** — Settings → Skills → Skill Library copies a
   bundled skill into the project's `.prismnext/agent/skills/<skill-id>/`.
2. **Invoke in chat** — describe the task and the agent loads the matching
   skill, or pick it explicitly with `/` in the composer.
3. **New chat tab** — after creating or editing a skill, open a new chat tab
   for it to appear (skill lists are session-scoped).
4. **Enable / disable / delete** — Settings → Skills toggles each skill and
   shows an origin badge per row: **built-in** (shipped with the app),
   **registry** (installed from a source), **custom** (written by you or
   skill-creator). Any installed skill can be deleted; built-ins can be
   reinstalled from the Library at any time.

### Project paths

| Content | Path |
| --- | --- |
| Skill files | `.prismnext/agent/skills/<skill-id>/` |
| Enabled-state manifest | `.prismnext/agent/skills-manifest.json` |
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
SymPy / matplotlib requires `uv pip install` into the project venv (e.g.
`uv pip install sympy`).

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
- **The `specs/` convention.** Working documents — deep analysis, decision
  records, drafts-in-progress — live in the project's `specs/` folder (a
  plain folder, deliberately not an app feature). The project brief holds
  only what has settled; notes are durable assets and live in the notebook.
- **Tools are always safe to reference.** App tools (`experiment-run`,
  `literature-*`, `latex-compile`, `citation-health`, …) are registered in
  the main process regardless of skill toggles.

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

### Mathematics

| Skill | What it does |
| --- | --- |
| [symbolic-math](symbolic-math/SKILL.md) | SymPy-checked symbolic derivations → LaTeX: calculus, linear algebra, ODEs, gradient/Hessian verification |

### Figures (`figure-*`)

| Skill | What it does |
| --- | --- |
| [figure-matplotlib](figure-matplotlib/SKILL.md) | Scientific plotting norms and matplotlib templates; colorblind-safe palettes |
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
| Algebra, integrals, derivatives, series, ODEs | symbolic-math | SymPy check + numerical probes + LaTeX |
| Verify gradients, Jacobians/Hessians | symbolic-math | Against autodiff or by hand |
| Commutative diagrams, category-style figures | figure-tikz | Drawing, not proof |
| Structure theorems (groups, rings, topology) | — | **Out of scope** for bundled skills |

### 5. Figures

Data from experiment runs: figure-matplotlib (how to draw) → figure-pipeline
(wire into the manuscript) → figure-interaction (panel display).

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
| symbolic-math | [verify_derivation.py](symbolic-math/scripts/verify_derivation.py) | SymPy | `experiment-run`; needs `uv pip install sympy` |
| statistical-rigor | [power_analysis.py](statistical-rigor/scripts/power_analysis.py) | **stdlib only** | `experiment-run` or venv |
| ml-research-protocol | [aggregate_seeds.py](ml-research-protocol/scripts/aggregate_seeds.py) | **stdlib only** | `experiment-run` |
| management-science-empirical | [simulate_did.py](management-science-empirical/scripts/simulate_did.py) | **stdlib only** | `experiment-run` |
| figure-matplotlib | [plot_template.py](figure-matplotlib/scripts/plot_template.py) | matplotlib | `experiment-run` |

Stdlib-only scripts need no installs — good for quick checks. SymPy /
matplotlib scripts install into `.prismnext/.venv` first.

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

1. Create `resources/skills/<skill-id>/`; the frontmatter `name` must equal
   the folder name.
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
`.prismnext/agent/skills/<skill-id>/` — never in project-root `.opencode/`
or `.agents/`.

---

## Boundaries (so the wrong skill is not picked)

| Task | In scope | Out of scope |
| --- | --- | --- |
| Symbolic identities (calculus, matrices, closed-form ODEs) | symbolic-math | — |
| Statistical testing & reporting | statistical-rigor | pure symbolic derivation |
| Plotting (matplotlib / TikZ) | figure-matplotlib, figure-tikz | mathematical proof |
| Structure theorems (groups, rings, topology, bundles) | manual proof or formal tools (not bundled) | symbolic-math |
| Long GPU training | `experiment-run` + islands | math-skill verification scripts |

---

## Related docs

- Skill authoring guide: [skill-creator/SKILL.md](skill-creator/SKILL.md)
- Bundled skills tests: `tests/main/bundled-skills.test.ts`
- App-side sync & OpenCode layout: `.cursor/rules/opencode-and-skills-layout.mdc`
