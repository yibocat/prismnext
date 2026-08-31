---
name: figure-matplotlib
description: Use when drawing a data figure with matplotlib/seaborn — pick a named pattern script (line, CI band, grouped bar, violin, scatter+fit, heatmap, ROC/PR, or 2×2), copy it with the style file, fill real data, experiment-run, stop when PDF/PNG land in the figures folder. Not for architecture/schematics (→ figure-typst if the manuscript root is .typ, else → figure-tikz), Observable Plot vocab (→ figure-observable-plot), manuscript wiring (→ figure-pipeline), or chat panel cards (→ figure-interaction).
license: MIT
---

# Figure: Matplotlib & Seaborn

Start from a named pattern and the style file. Run it. When the PDF is
in the figures folder, the job is done. `scripts/` and `assets/` below
are in this skill folder (next to `SKILL.md`), not the project root.

**Backends**: matplotlib first; seaborn is the same pipeline. Other
backends or 3D only when the user asks.

## Pick one pattern

| Ask | Start from |
|-----|------------|
| One panel line (loss, metric vs step) | `scripts/plot_template.py` |
| Trend + named interval band | `scripts/plot_timeseries_ci.py` |
| Grouped bar + error | `scripts/plot_grouped_bar.py` |
| Group comparison (distribution) | `scripts/plot_box_violin.py` |
| Two-variable scatter + claimed fit | `scripts/plot_scatter_fit.py` |
| Matrix / correlation | `scripts/plot_heatmap.py` |
| ROC / precision-recall | `scripts/plot_roc_pr.py` |
| Multi-panel (2×2, shared colorbar) | `scripts/plot_multipanel.py` |
| Architecture / schematic | **Stop.** `figure-tikz` |
| Density / hexbin / facets / geo | **Stop.** `figure-observable-plot` |

Do not start from an empty `pyplot` script. Do not invent a ninth
pattern when one of the rows matches.

## Closed path

Four steps. No reconnaissance.

1. **Copy both files** — the matching `scripts/plot_*.py` **and**
   `assets/prism.mplstyle` into the experiment island or scripts
   folder. The script loads the style next to itself; copying the
   script alone drops the style. Rename the script to the figure.
2. **Fill data in that script** — load from a run artifact or a real
   CSV on disk. Keep loading and plotting in the same file. Axis
   labels include units. Use the style file's cycle; do not invent a
   palette. Output directory = the project's figures folder
   (Workspace Folder Descriptions — do not guess `figures/` if the
   project uses another name).
3. **Run** — `experiment-run` (project venv injected). If `import
   matplotlib` fails: `uv pip install matplotlib numpy` into
   `.prismnext/.venv` only — never the system Python, never `which
   python`. On error: edit the script, run again.
4. **Stop.** Chat already previews the PDF/PNG.

**Done** = that PDF (and preview PNG) exist. One short sentence in
chat (what the figure shows). Nothing else.

**Do not** (unless the user named that next step):

- Read `references/chart-selection.md` / `journal-sizing.md` /
  `figure-qc.md` as a prelude — those are for a stuck chart-type or a
  submission pass, not for drawing
- `\includegraphics` into the manuscript, `latex-compile`, or
  `interaction-write`
- bash `which` / raster converters / deleting the output
- Hand-edit the PNG/PDF

Those are `figure-pipeline`, `figure-interaction`, or a later user ask.

## Craft (on demand)

- Figures regenerate from the script — never patch the output image.
- PDF for print; PNG is the chat preview the pattern already writes.
- Caption names the interval (95% CI / SD / …) and n when the pattern
  draws a band or error bar.
- `references/chart-selection.md` only when the chart type is actually
  unclear. `references/colorblind-palettes.md` only when you must leave
  the style cycle. `references/figure-qc.md` only before submission.
