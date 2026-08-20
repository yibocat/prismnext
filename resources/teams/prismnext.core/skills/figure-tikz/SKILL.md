---
name: figure-tikz
description: Use when drawing a standalone TikZ figure — architecture/pipeline/schematic diagrams (default), commutative diagrams, or small symbolic pgfplots. Closed path: copy the matching template, edit nodes, latex-compile-standalone, stop when the PDF sits next to the source. Not for experiment-data plots (→ figure-matplotlib), manuscript wiring (→ figure-pipeline), or chat panel cards (→ figure-interaction).
license: MIT
---

# LaTeX TikZ Graphics

Start from a shipped template. Compile the figure in its own folder. When
the PDF is next to the `.tex`, the job is done.

## Pick one lane

| Ask | Template | Then |
|-----|----------|------|
| Architecture, pipeline, flowchart, schematic, 「架构图」 | `assets/architecture-diagram.tex` | Architecture path below |
| Commutative / tikz-cd | `assets/commutative-diagram.tex` | Other lanes |
| Small or symbolic line plot | `assets/pgfplots-lines.tex` | Other lanes |
| Data from a run / large CSV | — | **Stop.** Use `figure-matplotlib` |

Do not invent a fourth lane. Do not start from an empty `tikzpicture`.

## Architecture (closed path)

Four steps. No reconnaissance.

1. **Copy** this skill's `assets/architecture-diagram.tex` into the project's
   figures folder (the folder Workspace Folder Descriptions names for
   figures — do not guess `figures/` if the project uses another name).
   Rename to the figure (`model-overview.tex`, …).
2. **Rewrite in place** — node text, which nodes exist, edges, and the one
   `\tikzset` block. Keep `\documentclass[tikz,...]{standalone}`,
   `positioning`, and `arrows.meta`. Place nodes with `right=of` / `below=of`
   only. Do not switch to absolute coordinates. Do not add packages you
   are not using.
3. **Compile** — `latex-compile-standalone` with `mainFile` set to that
   figure path. On error: edit the `.tex`, compile again. A few
   compile–fix cycles is the whole loop. Never run a TeX engine via bash.
4. **Stop.** Chat already previews the PDF next to the source.

**Done** = that PDF exists. One short sentence in chat (what the diagram
shows). Nothing else.

**Do not** (unless the user named that next step):

- `latex-root` or `latex-compile` — those are the paper, not this figure
- bash `which` / `ls` / `sips` / `gs` / `pdftoppm` / `rm`
- `image-describe`, or rasterize the PDF so you can "look at it"
- `delete` conversion leftovers or the compiled PDF
- `\includegraphics` into the manuscript, font-matching, or
  `interaction-write`

Those are other skills or a later user ask.

## Other lanes

Same four-beat: **copy template → edit → `latex-compile-standalone` → stop.**

- **Commutative** — edit the `tikzcd` cells and arrows only. Ampersand
  inside a node or beamer: `[ampersand replacement=\&]`.
- **pgfplots** — keep `\pgfplotsset{compat=1.18}`. Swap series and labels.
  If the data is an experiment CSV, leave this skill.

## Craft (all lanes)

- One `\tikzset` at the top; no per-node color/size spam.
- Arrows: `arrows.meta` tips (`-{Stealth}`), not `>=latex'`.
- `references/tikz-recipes.md` only when a compile error is a TikZ
  construct you do not recognize — not as a prelude to drawing.
