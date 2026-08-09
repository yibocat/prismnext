---
name: figure-tikz
description: Use when drawing publication-quality TikZ/pgfplots figures — architecture and pipeline diagrams, commutative diagrams, function/schematic plots, and data line-plots rendered by LaTeX itself. Not for data-heavy result plots (→ figure-matplotlib). Templates compile standalone into the project's figures folder.
license: MIT
---

# LaTeX TikZ Graphics

Vector diagrams drawn by LaTeX itself: fonts match the manuscript, lines stay
sharp at any zoom, and the figure is diffable source. This skill ships
compiling templates — start from them, do not write TikZ from a blank page.

## When to use

- Model/pipeline architecture diagrams, flowcharts, schematics
- Commutative diagrams (tikz-cd) for category-flavored math
- Publication line plots where the data is small or symbolic (pgfplots)
- Any figure meant for print — paper, thesis, slides — pair with
  `figure-matplotlib` when the data comes from experiment runs

## Files in this skill

- `assets/architecture-diagram.tex` — layered block diagram (positioning
  library, styles, rounded boxes, arrows). The starting point for model
  figures.
- `assets/commutative-diagram.tex` — tikz-cd grid with labeled, curved, and
  dashed arrows.
- `assets/pgfplots-lines.tex` — multi-series line plot with error bars,
  legend discipline, column-width sizing.
- `references/tikz-recipes.md` — the recipes these templates use: libraries,
  positioning vs absolute coords, arrow tips, pgfplots compat, externalize.

## Workflow

1. **Pick the closest template** from `assets/`; copy it into the project's
   figures folder and rename. All templates use `\documentclass{standalone}`
   so they compile alone and during development.
2. **Check the engine** — `latex-root` tells you the project engine; TikZ
   works with pdflatex/lualatex/xelatex. pgfplots needs
   `\pgfplotsset{compat=...}` (the templates set it — keep the line).
3. **Edit incrementally, compile often** — `latex-compile` with `mainFile`
   set to the figure's path after each structural change; the figure compiles
   **in place in its own folder** (PDF/aux next to the source — never routed
   through the manuscript's `.prismnext/compile/` build). TikZ error messages
   point at the wrong line when you stack up edits.
4. **Include** — `\includegraphics` the PDF that landed next to the figure
   source, or move the picture into the manuscript with `input`; keep one
   source of truth.
5. **Match the manuscript** — the diagram inherits document fonts only when
   compiled inside it; standalone figures should use the same font family
   the manuscript sets.

## Rules

- Never absolutely-position every node — use the `positioning` library
  (`right=of a`) so the diagram survives edits.
- One style block at the top; no per-node ad-hoc formatting.
- Arrows use `arrows.meta` tips (`-{Stealth}`), not the deprecated `>=latex'`.
- If a picture is mostly *data*, it belongs to `figure-matplotlib`
  (matplotlib) — TikZ is for structure, schematics, and symbolic plots.
