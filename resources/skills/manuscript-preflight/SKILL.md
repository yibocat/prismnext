---
name: manuscript-preflight
description: Use before submission, sharing, or tagging a manuscript release — compile, citation integrity, bibliography sync, figure paths, desk-reject and anonymization checks, and git hygiene as one pass/fail checklist.
license: MIT
---

# Manuscript Preflight

One checklist before the manuscript leaves the desk. Report pass/fail with
exact fixes — apply fixes only when the user asks.

## When to use

- Before submission, sharing a draft, or tagging a release
- After large edits, when the user wants a fresh integrity picture

## Checklist

1. **Root** — `latex-root` confirms main file, engine, and bib tool.
2. **Compile** — `latex-compile` → clean, or list errors with file/line.
3. **Citation integrity** — `citation-health` → missing keys, unused keys,
   library gaps, `verified=false` (suspected fabrication — flag loudly).
4. **Bibliography sync** — keys that should come from the library are missing
   from `.bib`? Propose `literature-export-bib` (with user confirmation).
5. **Figures** — every `\includegraphics` target exists under the figures
   folder; no absolute or machine-specific paths.
6. **Desk-reject risks** — walk `references/desk-reject-checklist.md`:
   anonymization for submission versions (author names, acknowledgments,
   grants, self-citations in third person, PDF metadata), page count vs the
   venue's current CFP, leftover TODO artifacts. Venue numbers change every
   cycle — verify against the current CFP, never from memory.
7. **Git hygiene** — working tree state; suggest a commit or annotated tag as
   the submission snapshot.

## Output

A checklist with ✅ / ❌ per item, each ❌ with the exact fix and the tool
that applies it. This skill reports — it does not edit, compile-fix, or
export without being asked.

## Rules

- `citation-health` runs in this conversation, never delegated.
- One preflight covers the whole manuscript — do not stitch partial scans.