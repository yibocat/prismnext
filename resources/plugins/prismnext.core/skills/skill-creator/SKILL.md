---
name: skill-creator
description: Use when the user wants to create, distill, or author a new agent skill — turning a workflow that just worked in conversation into a reusable skill, or authoring one from scratch — including multi-file skills with references, templates, scripts, and assets.
license: MIT
---

# Skill Creator

A skill is born one of two ways, and they are not equal:

- **Distilled from practice** — the workflow just happened in this
  conversation: steps were tried, corrected, and finally worked. This is
  the preferred origin; the skill encodes demonstrated practice, not
  imagined best practice.
- **Authored from scratch** — the user describes a workflow that has not
  been run yet. Fine for simple procedures, but the steps are hypotheses.

## Mode 1: Distill from practice

The moment: the conversation contains a procedure that actually worked,
and the user says some version of "make this a skill" — or you notice the
procedure is clearly reusable and propose it.

**Harvest from the transcript, in this order:**

1. **The trigger** — what did the user actually want at the start? That
   phrasing is raw material for the `description`.
2. **The steps that worked** — in the order they finally worked, not the
   order first attempted. Dead ends get dropped; the correction gets
   recorded.
3. **The corrections** — every place the user pushed back ("no, not like
   that") is a Rule in the skill. Rules earned from real mistakes are the
   most valuable content a skill has.
4. **The forks** — every point where the user made a decision marks a spot
   for judgment-driven use of the `question` interaction. Do not script an
   interrogation; mark where the fork genuinely belongs to the user.
5. **The tools** — which app tools were actually called, with what inputs.
6. **The artifacts** — tables, templates, scripts, checklists produced
   along the way. Generalized, these become `templates/` and `scripts/`.

**Then abstract.** Remove the conversation's specifics — the topic, the
numbers, the project name, that particular paper. What stays is the
procedure, the checks, the forks, the pitfalls. A skill with residue from
one past conversation reads as overfit and misleads the next run.

**Backtest the trigger.** Put the start of the original conversation in
front of the drafted `description`: would it have matched? If not, the
description is wrong — fix it before anything else.

## Mode 2: Author from scratch

Ask **one or two** short questions only if the request is vague:

1. What task should this skill help with? (concrete trigger scenarios)
2. What should the agent do step by step when the skill loads?

Do not over-interview. Start the draft from
`templates/SKILL.template.md` — a skeleton with the frontmatter rules and
section prompts inline. Sections are earned, not mandatory: delete empty
ones, and let a distilled skill's structure follow what actually happened
rather than the skeleton. Mark the new skill honestly as untested, and
after its first real use, revisit it with the distillation workflow
above — the first run always reveals corrections.

## Skill anatomy

A skill is a folder. `SKILL.md` is mandatory; everything else is earned.

```
<skill-id>/
├── SKILL.md        # the router: triggers, procedure skeleton, rules
├── references/     # deep docs, loaded on demand ("walk references/x.md")
├── templates/      # fill-in patterns generalized from real artifacts
├── scripts/        # executable helpers (python/node)
└── assets/         # style files, images, other resources
```

- **Keep `SKILL.md` lean.** It is the router the agent reads every time
  the skill triggers. If a section is bulky detail consulted only in one
  branch (a venue checklist, a format spec), move it to `references/` and
  point at it. A 300-line SKILL.md is two skills or a skill with missing
  references.
- **`templates/`** hold patterns, not molds — say so inside each template
  ("adapt, blend, reorder, or depart"). Templates distilled from real
  artifacts beat invented ones.
- **`scripts/` path discipline** — this is the most common multi-file bug:
  - reference sibling files (styles, data) relative to the script's own
    location, never the CWD;
  - files that travel together (script + its style file) must be copied
    together — say so where the skill tells the user to copy things;
  - fail loudly with a clear message when an expected sibling is missing,
    never silently fall back to defaults.
- **All paths inside `SKILL.md` are relative to the skill folder**
  (`references/foo.md`, `scripts/bar.py`) — never absolute.

## Frontmatter craft

```markdown
---
name: skill-id
description: One sentence — what it does AND when to use it, front-loaded with trigger keywords.
license: MIT
---
```

- `name` must equal the folder name: lowercase letters, numbers, hyphens.
- **`description` is written for the matcher, not for a human reader.**
  It is the only text the agent sees when deciding whether to load the
  skill. Front-load the trigger words; cover the non-obvious scenarios
  too (a skill described only as "for new X" will never fire on "continue
  X in a new direction"). Third person: "Use when…".
- **YAML rule**: no unquoted `: ` (colon + space) inside `description` —
  it breaks frontmatter parsing. Rephrase, or quote the whole value.
  (Learned the hard way.)

## Install location

Write skills under this **relative** project path (same on macOS, Windows,
Linux):

```
.prismnext/agent/skills/<skill-id>/SKILL.md
```

- prismnext stores skill files only under `.prismnext/agent/skills/` and
  syncs OpenCode automatically (app-level config, not in the project).
- Skills created here are **user-created**: they appear in Settings →
  Skills marked as custom, and can be deleted there. Bundled skills ship
  with the app — they can be enabled/disabled but not deleted.
- A **new chat tab** is required before the skill can be invoked via the
  `skill` tool (skill lists are session-scoped).

## Quality bar

- **Earn its place**: orchestrate this app's tools (literature-*,
  experiment-*, latex-*, citation-health, …) or encode a heavy procedure.
  Generic advice the model already knows does not belong in a skill.
  Tools are registered in main regardless of skill toggles, so referencing
  tools is always safe.
- **Stand-alone contract**: the skill must work when every other skill is
  disabled. Reference siblings only as routing pointers ("that work
  belongs to X") or optional upgrades with a fallback ("use X when
  enabled, otherwise do the key step inline"). Inline small critical
  content instead of referencing it.
- **Judgment-driven interaction**: mark where decisions belong to the
  user; do not script fixed question batteries. Two gates stay hard:
  confirm the plan/outline before writing at length, and estimate cost and
  confirm before any expensive run.
- **End with a Done-when checklist** — verifiable conditions, so the next
  run knows when it is finished.
- Never claim a skill "triggers automatically" on some event — skills are
  matched per turn from the description, or invoked explicitly with `/`.
- One domain per skill. No skills for one-off tasks.

## Before delivering

- [ ] Every file referenced in `SKILL.md` exists; paths are relative.
- [ ] Scripts parse (`py_compile` / `node --check`); sibling-file
      discipline holds.
- [ ] Description backtested against the originating conversation (mode 1)
      or against the user's stated scenarios (mode 2).
- [ ] Re-read as if every other skill were disabled — still works?
- [ ] User told: new chat tab needed; manageable in Settings → Skills.

## Forbidden paths (never create)

| Path | Why |
|------|-----|
| `.agents/` or `.agents/skills/` | OpenCode default — not prismnext storage |
| `<project>/.opencode/` | Runtime/npm artifacts; pollutes Git |
| Any path outside `.prismnext/agent/skills/` for SKILL.md | Breaks Settings + sync |
