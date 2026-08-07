---
name: figure-interaction
description: Use when presenting a result as a reopenable figure or plot in the RightArea panel — visual standards (palette, sizing, legibility on any theme), choosing between a static figure and a CSV plot, and update discipline. Not for making the figures themselves (→ figure-matplotlib / figure-tikz) or wiring them into the manuscript (→ figure-pipeline).
license: MIT
---

# Interaction Figures

The RightArea panel is where results live visually: a figure the user can
reopen, keep beside the chat, and come back to tomorrow. This skill is the
craft standard for what goes there. A panel figure is read more often than
any manuscript figure — make it worth rereading.

## Choosing the form

- **Static figure** when the visual is carefully typeset and finished —
  the matplotlib/TikZ pipeline output, a diagram, a composed result.
- **CSV plot** when the value is the data itself — quick looks at results,
  curves the user may want to re-examine, anything where a live-rendered
  view beats a frozen image. Kinds: `plot.line` / `plot.series` /
  `plot.scatter` / `plot.area` (numeric x/y, melted by series), `plot.bar`
  (categorical x; multiple y columns stack), `plot.histogram` (one numeric
  column, optional `params.bins`), `plot.box` (group column x + one
  numeric y), `plot.density` (numeric x/y density contours over a faint
  dot underlay), `plot.heatmap` (x/y cells + `params.fill` value column).
- Either way: **one object answers one visual question.** A second
  comparison is a second object, not more series crammed in.

## Visual standards

These apply to everything shown in the panel, exploratory or final:

- **Palette**: colorblind-safe only. Okabe-Ito defaults: `#0072B2` (blue),
  `#E69F00` (orange), `#009E73` (bluish green), `#D55E00` (vermillion),
  `#CC79A7` (reddish purple), `#56B4E9` (sky blue), `#F0E442` (yellow),
  `#000000`. Never red–green contrasts.
- **Background**: export transparent-background images so the panel's own
  theme (light or dark, any pack) shows through. A white box on a dark
  panel is a defect.
- **Contrast**: lines and text must survive both light and dark themes —
  mid-tone colors, no pure-black hairlines that vanish on dark, no
  pastel-on-white.
- **Sizing**: the panel is a sidebar, not a page. Design for ~400–600 px
  display width: fonts, markers, and line weights legible at that size.
  If detail needs a page, the figure belongs in the manuscript pipeline.
- **Format**: SVG when the figure is vector-native (crisp at any panel
  width); high-DPI PNG otherwise.
- **Labeling**: axes with quantities and units, a legend when more than one
  series, sample size or seed count on the figure or in its title. A panel
  figure has no caption — it must explain itself.
- **Honesty**: axes start where the data story starts (say so when not at
  zero), error bars state what they are (std or 95% CI), no smoothing
  without saying so.

## Titles and naming

- The title replaces the caption: state what the reader should see —
  "Validation loss, 5 seeds, mean ± std" — not "results plot".
- Give each object a stable, topic-scoped name (`loss-curve-exp3`, not
  `plot1`). Names are how you and the user refer to it later.

## Update discipline

- Same question, better data → update the same object; the user's mental
  bookmark stays valid.
- New question → new object. Do not silently repurpose an old one.
- When you update, say what changed in one sentence in the chat — the user
  may have the old version open.

## Scope, for now

The panel shows static images and CSV plots (the nine kinds above;
categorical palettes are Okabe-Ito and continuous scales viridis by
default). Interactive, 3D, and externally-rendered views (custom JS specs,
three.js) are a designed future extension — if asked, say the current
scope plainly and offer the best static alternative instead. For
manuscript-grade plots beyond the panel's kinds, use the figure pipeline.

## Workflow

1. Make the figure properly — script-generated (never hand-edited output),
   sized for the panel; when `figure-matplotlib` is enabled, use its style
   file and template. Saved in the project.
2. Register it as a panel object (image or CSV) with a clear title and a
   stable name.
3. Share the card in chat with one sentence: what it shows and what to
   look at. Not a wall of interpretation — the figure should carry itself.
