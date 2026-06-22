---
name: skill-creator
description: Use when the user wants to create, write, or author a new agent skill (SKILL.md), extend agent capabilities, or asks to make a skill, create a skill, or define a reusable workflow.
license: MIT
---

# Skill Creator

Guide the user through creating an OpenCode-compatible agent skill for this Prism project.

## When to use

- User asks to create, write, add, or author a skill
- User wants a reusable workflow the agent can load later via the skill tool
- User is unsure how SKILL.md works but has a goal in mind

## Before writing

If the request is vague, ask **one or two** short clarifying questions:

1. What task should this skill help with? (concrete trigger scenarios)
2. What should the agent do step-by-step when the skill is loaded?

Do not over-interview. If the user already gave enough detail, proceed.

## Prism project layout

Install skills under:

```
.prismnext/agent/skills/<skill-id>/SKILL.md
```

- `<skill-id>` must match the `name` in frontmatter (lowercase letters, numbers, hyphens only; e.g. `bibtex-cleanup`, `my-workflow`)
- Prism loads skills from `.prismnext/agent/skills/` through the app agent config; do not create `.opencode/` or `opencode.json`
- After creating or editing a skill, tell the user to **start a new chat tab** for the agent to pick it up

## SKILL.md format

```markdown
---
name: skill-id
description: One sentence — what it does AND when to use it (front-load trigger keywords).
license: MIT
---

# Title

## When to use
- Bullet triggers

## Instructions
Step-by-step guidance for the agent.
```

Rules:

- `description` is required and shown to the agent when choosing skills — write in third person ("Use when…")
- Body is markdown instructions only (no duplicate frontmatter)
- Keep skills focused: one domain per skill

## Workflow

1. Propose a `skill-id` and one-line description; confirm if naming is ambiguous
2. Draft the full SKILL.md (frontmatter + body)
3. Write the file to `.prismnext/agent/skills/<skill-id>/SKILL.md` using the project's file tools
4. Confirm the path and remind: new chat tab to use it; optional toggle in Settings → Skills

## Quality bar

- Prefer actionable steps over generic advice
- Include examples or checklists when helpful
- If similar skills exist in the project, match their tone and depth
- Do not create skills for one-off tasks that do not need reuse
