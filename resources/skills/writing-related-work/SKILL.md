---
name: writing-related-work
description: Use when drafting a Related Work / literature review section or a standalone synthesis note — organizing prior work into a grounded, cited narrative or comparing methods across papers, from the project library plus staged external discovery. Never cites from memory.
license: MIT
---

# Writing: Related Work

Draft a Related Work section (or a standalone synthesis note) where every
citation is grounded in the project library or a staged external paper —
never in memory.

Part of the `writing-*` family but fully stand-alone: if `writing-design`
produced an outline, read it for the section's role; if not, ask the user
what the narrative serves.

## When to use

- Drafting or rewriting Related Work / literature review sections
- Writing a standalone synthesis note on a theme (not tied to a manuscript)
- Comparing methods, datasets, or results across papers
- Turning a pile of library papers into an organized, cited narrative

## Workflow

1. **Ground the story** — call `research-brief-read`. Know which claim or
   question this section serves; if the brief names themes or RQs, they become
   the outline skeleton.
2. **Inventory the library** — `literature-search` per theme (prefer
   tag-aware queries when the user organized by topic). Build a
   theme → bibkeys map from real results only.
3. **Fill gaps** — `literature-discover` for themes with thin coverage.
   Catalogs first; websearch only when catalogs are insufficient.
4. **Stage externals** — `literature-stage` every external paper you will
   mention; cite those as `[n]`. Library papers stay `[@bibkey]` — never
   both formats for the same paper.
5. **Read what you cite** — `literature-read` for metadata/abstract;
   `literature-read-pdf` when a specific claim needs the PDF body.
   Abstract-level knowledge supports theme-level statements only — a
   specific method or result number from an abstract alone must be hedged
   ("report", "propose") or upgraded to a PDF read.
6. **Draft by theme, not chronology** — each theme: what was done →
   limitation → the gap your work addresses. Neutral, evidence-based
   comparisons; cite primary sources.
7. **Sync the bibliography** — `literature-export-bib` for keys now cited in
   `.tex`; verify with `latex-compile` if the manuscript changed. For a
   standalone note, skip this step.
8. **Report to the outline** — when `outline.md` exists, mark this section
   `done` with a one-line note.

## Done when

- Every theme paragraph is supported by real bibkeys / staged ids.
- Zero citations from memory; every entry traces to a tool result.
- Anything not actually read this session is marked TODO for the user.
- `literature-export-bib` synced and `latex-compile` passes (manuscript
  mode), or the note is saved to its project file (note mode).

## Rules

- Never invent bibkeys, DOIs, titles, or results — every entry traces to a
  tool result from this session.
- No `literature-add` unless the user explicitly asks to keep a paper.
- Numbers and claims in the draft must come from content you actually read
  this session — mark anything else as TODO.
