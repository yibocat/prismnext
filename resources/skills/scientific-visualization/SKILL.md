---
name: scientific-visualization
description: Use when creating figures — for analysis, notes, or publication — chart selection, colorblind-safe palettes, a ready matplotlib style file, and a plotting template that outputs into the project's figures folder.
license: MIT
---

# Scientific Visualization

Publication figures with real assets: a style file you can apply in one
line, palette hexes that are actually colorblind-safe, and a template script
that already writes to the right place.

## When to use

- Plotting intermediate results to *understand* them — an exploratory figure
  still earns the same legibility; you are its first reader
- Creating or regenerating manuscript figures (pair with `figure-pipeline`)
- Choosing a chart type for data
- Fixing figures reviewers called unreadable

## Files in this skill

- `assets/prism.mplstyle` — matplotlib style: column-width sizing, embeddable
  fonts, spine/grid discipline, colorblind-safe default cycle. Copy or
  reference it from plotting scripts.
- `references/chart-selection.md` — data shape → chart mapping, log scales,
  error-bar conventions. Read before picking a chart.
- `references/colorblind-palettes.md` — Okabe-Ito / Tol hex values and usage
  rules.
- `scripts/plot_template.py` — runnable template: loads the style, correct
  figure size, saves PDF+PNG. Start plots from this file.

## Workflow

1. **Read `references/chart-selection.md`** and justify the chart choice in
   one sentence (what comparison should the reader's eye do?).
2. **Start from `scripts/plot_template.py`** — copy it into the experiment
   island or scripts folder; keep data loading and plotting in the same
   script so the figure regenerates end-to-end.
3. **Run via `experiment-run`** (project venv injected); output lands in the
   project's figures folder.
4. **Check against the standards** — axis labels with units, sample sizes,
   legible at final column width, palette from
   `references/colorblind-palettes.md`.
5. **Wire & verify** — `\includegraphics` + caption + label; `latex-compile`;
   `interaction-write` when the figure should be reopenable in chat.

## Rules

- Figures regenerate from scripts — never edit output images by hand.
- PDF (vector) for the manuscript; PNG only for preview/chat.
- No chartjunk: default to the style file instead of ad-hoc colors and grids.
