---
name: figure-matplotlib
description: Use when creating data-driven 2D figures — for analysis, notes, or publication — with matplotlib or seaborn. Chart selection, colorblind-safe palettes, a ready style file, and a plotting template that outputs into the project's figures folder. Not for structural diagrams (architecture, schematics → figure-tikz), not for the manuscript-wiring process (→ figure-pipeline), not for panel presentation standards (→ figure-interaction).
license: MIT
---

# Figure: Matplotlib & Seaborn

Publication figures with real assets: a style file you can apply in one
line, palette hexes that are actually colorblind-safe, and a template script
that already writes to the right place.

**Backends**: matplotlib first; seaborn welcome (it is matplotlib under the
hood — same style file, same PDF/PNG pipeline). Other backends only when the
user asks. 3D: prefer 2D projections or slices — they read better in print;
if a true 3D view is needed, matplotlib's `mplot3d` works but say plainly
that interactive/3D panel views are not currently supported.

## When to use

- Plotting intermediate results to *understand* them — an exploratory figure
  still earns the same legibility; you are its first reader
- Choosing a chart type for data
- Creating the figure files themselves (wiring them into the manuscript →
  `figure-pipeline` if enabled; presenting them in the side panel →
  `figure-interaction` if enabled)
- Fixing unreadable figures

## Files in this skill

- `assets/prism.mplstyle` — matplotlib style: column-width sizing, embeddable
  fonts, spine/grid discipline, colorblind-safe default cycle.
- `references/chart-selection.md` — data shape → chart mapping, log scales,
  error-bar conventions. Read before picking a chart.
- `references/colorblind-palettes.md` — Okabe-Ito / Tol hex values and usage
  rules.
- `scripts/plot_template.py` — runnable template: loads the style, correct
  figure size, saves PDF+PNG. Start plots from this file.

## Workflow

1. **Read `references/chart-selection.md`** and justify the chart choice in
   one sentence (what comparison should the reader's eye do?).
2. **Copy both files** — `scripts/plot_template.py` **and**
   `assets/prism.mplstyle` into the experiment island or scripts folder.
   The template resolves the style next to itself by default; copying the
   script alone silently drops the style. Keep data loading and plotting in
   the same script so the figure regenerates end-to-end.
3. **Run via `experiment-run`** (project venv injected); output lands in the
   project's figures folder. If `import matplotlib` fails, install into the
   project venv only: `uv pip install matplotlib numpy`
   (`.prismnext/.venv`) — never the system Python.
4. **Check against the standards** — axis labels with units, sample sizes,
   legible at final column width, palette from
   `references/colorblind-palettes.md`.
5. **Wire & verify** — `\includegraphics` + caption + label; `latex-compile`;
   `interaction-write` when the figure should be reopenable in chat.

## Rules

- Figures regenerate from scripts — never edit output images by hand.
- PDF (vector) for the manuscript; PNG only for preview/chat.
- No chartjunk: default to the style file instead of ad-hoc colors and grids.
