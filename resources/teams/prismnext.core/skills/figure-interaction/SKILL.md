---
name: figure-interaction
description: Use only when the user asked for a reopenable chat/panel card and the figure or CSV already exists on disk — interaction-write, one sentence, stop. Not for drawing (→ figure-matplotlib / figure-tikz / figure-typst) or manuscript wiring (→ figure-pipeline).
license: MIT
---

# Interaction Figures

A card the user can reopen beside chat. The file must **already exist**.
This skill does not draw and does not touch the manuscript.

## When to use

- The user asked to keep, pin, or reopen a figure/plot in the panel
- Updating an existing card with a new file for the **same** visual
  question

Not: "draw me a figure" (chat already previews the PDF). Not: put it in
the paper.

If the file is missing, make it with the drawing skill first, then come
back — do not start matplotlib from this skill.

## Closed path

1. **Pick the kind** — `figure.static` for a finished PDF/PNG/SVG on disk;
   a `plot.*` kind when the value is a real CSV (line / series / scatter /
   area / bar / histogram / box / density / heatmap — params on the
   `interaction-write` tool). One object, one visual question.
2. **Write** — `interaction-write` with a stable name (`loss-curve-exp3`,
   not `plot1`) and a title that states what to see ("Validation loss, 5
   seeds, mean ± std"). Embed the returned `fenceMarkdown`.
3. **Stop.** One sentence in chat. The card is the figure.

Same question, better data → update that object. New question → new
object. Say what changed in one sentence.

## Standards (when writing the spec)

- Palette: Okabe-Ito only (`#0072B2 #E69F00 #009E73 #D55E00 #CC79A7
  #56B4E9 #F0E442 #000000`). Never red–green.
- Static exports: transparent background; contrast that survives light and
  dark; sized for a ~400–600 px sidebar.
- A panel figure has no caption — title and axes must explain it.
- Interactive / 3D / custom JS: out of scope; say so and offer static.

## Do not

- `latex-compile` or `\includegraphics`
- Rasterize or delete the source file
- Hand-edit the output image
