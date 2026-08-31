---
name: manuscript-preflight
description: Use before submission, sharing, or tagging a manuscript release — compile, citation integrity, bibliography sync, figure paths, desk-reject and anonymization checks, and git hygiene as one pass/fail checklist. Mechanical integrity only — it does not judge the argument or the science.
license: MIT
---

# Manuscript Preflight

One checklist before the manuscript leaves the desk. Report pass/fail with
exact fixes — apply fixes only when the user asks.

This checks the **envelope**, not the argument: compile health, citation
integrity, anonymity, format. Whether the claims hold up is a different
pass — see `critical-review` when enabled, or just run a content review in
conversation.

## When to use

- Before submission, sharing a draft, or tagging a release
- After large edits, when the user wants a fresh integrity picture

## Checklist

1. **Manuscript entry** — read **Workspace Folder Descriptions** (Manuscript folder + optional compile entry pin). For `.tex` use `latex-compile`; for `.typ` use `typst-compile`.
2. **Compile** — build tool → clean, or list errors with file/line.
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

### PDF-level checks without a tool

Anonymity of PDF metadata and page count live inside the built PDF. If
`pdfinfo` or `exiftool` is available in the environment, use it; if not,
list these as **manual items** ("open document properties, check author
field; count pages against the CFP limit") — never silently skip them.

## Output

A checklist per item, each marked:

- ✅ pass
- ❌ **blocker** — fabrication-suspect citations, compile errors, broken
  figure paths, anonymity leaks. Must be fixed before the manuscript moves.
- ⚠️ **warning** — unused keys, dirty git tree, manual items pending. The
  user's call.

Every ❌ / ⚠️ carries the exact fix and the tool that applies it. This skill
reports — it does not edit, compile-fix, or export without being asked.

## Rules

- `citation-health` runs in this conversation, never delegated.
- One preflight covers the whole manuscript — do not stitch partial scans.