<!--
Skeleton for a new SKILL.md — a starting point, not a form.
Sections are earned, not mandatory: delete any section that has nothing
real to say. A distilled skill (mode 1) should follow what actually
happened in practice, not this outline — use this skeleton mainly for
mode 2 (authoring from scratch) and as a frontmatter reference.
-->
---
name: skill-id
description: Use when … — what it does AND when to trigger, front-loaded with keywords. No unquoted ": " (colon+space) in this value — it breaks YAML.
license: MIT
---

# Title

One short paragraph: what this skill does, and the stance it takes.
<!-- If the skill encodes a discipline or a strong opinion, say it here —
this paragraph is what the agent re-reads every time the skill fires. -->

## When to use

- Concrete trigger situations — the obvious one first
- The non-obvious scenario a user would not guess this skill covers
<!-- The description + this list are the whole discovery surface.
If a situation should fire this skill, it must be visible here. -->

## Workflow

1. Steps in the order that actually works — not the idealized order.
2. Mark forks that belong to the user (→ judgment-driven `question`),
   and gates that stay hard (confirm before long writes, confirm cost
   before expensive runs).

<!-- Bulky detail consulted only in one branch belongs in references/foo.md;
point at it: "walk references/foo.md". Only create the folder when the
content exists. Same for templates/ and scripts/ — see the anatomy rules. -->

## Rules

- Corrections earned from practice. "Never X" beats "consider avoiding Y".
- Each rule should trace to a real mistake or a real requirement.

## Done when

- [ ] Verifiable condition the next run can check
- [ ] Another one
