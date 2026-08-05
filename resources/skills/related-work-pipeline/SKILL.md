---
name: related-work-pipeline
description: Use when drafting a Related Work / literature review section, synthesizing prior work into a cited narrative, or comparing methods across papers — from the project library plus external discovery.
license: MIT
---

# Related Work Pipeline

Draft a Related Work section where every citation is grounded in the project
library or a staged external paper — never in memory.

## When to use

- Drafting or rewriting Related Work / literature review sections
- Comparing methods, datasets, or results across papers for a manuscript
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
   `literature-read-pdf` only for intensive-reading papers when a specific
   claim needs the PDF body.
6. **Draft by theme, not chronology** — each theme: what was done →
   limitation → the gap your work addresses. Neutral, evidence-based
   comparisons; cite primary sources.
7. **Sync the bibliography** — `literature-export-bib` for keys now cited in
   `.tex`; verify with `latex-compile` if the manuscript changed.

## Rules

- Never invent bibkeys, DOIs, titles, or results — every entry traces to a
  tool result from this session.
- No `literature-add` unless the user explicitly asks to keep a paper.
- Numbers and claims in the draft must come from content you actually read
  this session — mark anything else as TODO.