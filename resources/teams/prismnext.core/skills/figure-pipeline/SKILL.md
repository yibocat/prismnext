---
name: figure-pipeline
description: Use only when the user asked to put an existing (or just-drawn) figure into the manuscript — includegraphics, caption, label, in-text cite, then latex-compile. Not for drawing the figure (→ figure-matplotlib / figure-tikz / figure-observable-plot) and not for chat panel cards (→ figure-interaction).
license: MIT
---

# Figure Pipeline

Plumbing from a figure **file that already exists** into the paper. This
skill does not draw. If the PDF/PNG/SVG is not on disk yet, stop and use
the drawing skill (`figure-matplotlib`, `figure-tikz`, or
`figure-observable-plot`); come back only if they still want it in the
manuscript.

## When to use

- The user asked to insert, replace, or re-wire a figure **in the
  manuscript**
- Regenerating a manuscript figure from a new run artifact, then updating
  the `\includegraphics` path

Not: "draw me a figure", "plot the loss", or "make a card I can reopen".

## Closed path

1. **Source file** — the figure path on disk. Prefer a run
   `artifactSnapshots` path over a mutable working copy. If it does not
   exist, do not invent one here.
2. **Wire** — `\includegraphics` with the figures-relative path, a caption
   that states what the figure *shows*, `\label{fig:...}`, and one in-text
   reference. Caption bar: axis units, sample size / seeds when relevant.
3. **Compile** — `latex-compile` (the paper). Fix broken paths or missing
   labels; do not start a drawing loop.
4. **Stop.**

**Do not** (unless the user named that next step):

- `interaction-write`
- Re-plot from scratch inside this skill
- bash conversion (`cairosvg`, `sips`, `gs`) just to have another format

## Rules

- Never hand-draw data values; the file on disk must come from a script or
  a TikZ source.
- Historical figures come from run artifact snapshots, not files later
  runs may overwrite.
