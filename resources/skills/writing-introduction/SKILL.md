---
name: writing-introduction
description: Use when drafting or rewriting a paper's Introduction — framing the problem, positioning against prior work, and stating contributions as checkable claims, grounded in the brief, notes, and the library. Reference rhetorical patterns, adapted to the paper — never applied as molds.
license: MIT
---

# Writing: Introduction

The Introduction is a contract with the reader: the problem, why it matters,
what this document delivers, and where each promise is kept. Everything in
it must be deliverable — every citation grounded, every contribution claim
mapped to a section that proves it.

If `writing-design` produced `outline.md`, read it first: the story
paragraph and the promise map are this section's spec. If there is no
outline and this is a whole new document, propose the outline discussion
first (`writing-design` when enabled); if the user wants to skip it, ask
what the Introduction must promise — never draft from thin air.

## When to use

- Drafting or rewriting an Introduction / opening section
- Sharpening contributions from a finished draft (reverse-engineering the
  promises)
- Checking a draft Introduction against what the paper actually delivers

## Files in this skill

- `templates/problem-driven.md` — the problem is widely felt; open with the
  pain, then the gap, then the key observation.
- `templates/contribution-first.md` — the audience already knows the
  problem; open with what is new, then situate.
- `templates/story-arc.md` — the contribution needs context to appreciate;
  open with the evolving understanding that made the answer visible.

These are **reference patterns, not molds** — study them, take what fits,
blend or depart as the material demands. The bar is an Introduction that
reads true for this paper, not one that matches a file.

## Workflow

1. **Read the spec** — `outline.md` when present (story, audience, promise
   map); otherwise `research-brief-read` plus a user conversation about the
   document's promise.
2. **Discuss the pattern with the user** — present the reference patterns with
   one-line trade-offs. Use `question` when the call is genuinely theirs —
   e.g. what the reader should remember after one read, anything to
   emphasize or deliberately avoid; when the conversation already answers
   these, do not re-ask.
3. **Gather citations** — `literature-search` / `literature-stage`; every
   positioning claim gets a real bibkey or staged id. Broad survey-shaped
   positioning belongs to `writing-related-work` when enabled — cite its
   output, do not duplicate it.
4. **Draft** — following the chosen pattern; contributions as one
   checkable claim each ("we show X improves Y under Z"), never adjectives
   ("novel", "powerful").
5. **Consistency pass** — every promise maps to a section that keeps it
   (the promise map); every section the outline says delivers something is
   referenced by a promise. Flag mismatches instead of papering over them.
6. **Verify** — `latex-compile` after edits.
7. **Report to the outline** — when `outline.md` exists, mark this section
   `done` with a one-line note; if the draft moved any promise, patch the
   promise map and tell the user what changed.

## Done when

- Every citation traces to the library / a staged paper this session.
- Every contribution claim maps to a delivering section.
- The reader can state the paper's promise after one paragraph.
- `latex-compile` passes.

## Rules

- Never cite from memory — `literature-search` / `literature-stage` first.
- No result numbers without a run id (experiment receipts).
- Promises the paper does not keep get deleted or downgraded to "future
  work" — say which you did.
