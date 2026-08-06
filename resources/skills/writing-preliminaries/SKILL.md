---
name: writing-preliminaries
description: Use when drafting a Preliminaries / Background / Notation section — definitions, problem setup, and formal statements the rest of the paper builds on, with notation consistency and machine-checked formal claims. Reference patterns, not molds; include only what later sections actually use.
license: MIT
---

# Writing: Preliminaries

Preliminaries exist so the rest of the paper can be precise. The section
earns its length by usage: **every symbol, definition, and lemma stated here
must be used later** — unused setup is the first thing to cut.

If `writing-design` produced `outline.md`, it says which later sections
consume this setup — that is the inclusion list. Without an outline, ask the
user what the later sections need.

## When to use

- Drafting or rewriting Preliminaries / Background / Notation
- Formalizing the problem setup before a Methods or Theory section
- Auditing a draft for notation drift (same concept, two symbols)

## Files in this skill

- `templates/notation-first.md` — a notation table up front, then
  definitions grouped by theme. Best for symbol-heavy theory papers.
- `templates/problem-setup.md` — the running problem introduced
  informally first, formalized piece by piece. Best when the formalism
  serves one central problem.
- `templates/formal-definitions.md` — definition–lemma–remark blocks with
  numbered environments. Best for math-heavy venues.

These are **reference patterns, not molds** — adapt, blend, or depart as
the material demands; the bar is a section that reads true, not one that
matches a file.

## Workflow

1. **Collect the consumers** — from the outline or by asking: which
   sections use which concepts. The inclusion list comes from them, never
   from "standard background".
2. **Discuss the pattern with the user** — present their trade-offs. Use
   `question` when the call is genuinely theirs — e.g. how formal the
   audience is, notation conventions they insist on; when the conversation
   already answers these, do not re-ask.
3. **Draft** — define once, name once: one symbol per concept, one concept
   per symbol. State assumptions next to the statements that need them.
4. **Check the formal claims** — any non-trivial algebraic or symbolic
   statement here gets machine-checked (SymPy script; the `symbolic-math`
   skill packages this when enabled). A wrong definition in Preliminaries
   poisons everything downstream.
5. **Consistency pass** — cross-check against later sections for symbol
   collisions and drift; fix here, not there.
6. **Verify** — `latex-compile`.
7. **Report to the outline** — when `outline.md` exists, mark this section
   `done` with a one-line note; if anything later sections consume changed,
   patch the outline and tell the user.

## Done when

- Every symbol/definition is consumed by at least one later section.
- No symbol collision across the document.
- Non-trivial formal statements machine-checked.
- `latex-compile` passes.

## Rules

- Do not transcribe textbook background the audience already knows — cite
  the standard reference and move on.
- Assumptions ride with the statement that needs them, not in a distant
  paragraph.
