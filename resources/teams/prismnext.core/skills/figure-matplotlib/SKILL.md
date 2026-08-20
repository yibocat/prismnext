---
name: figure-matplotlib
description: Use when drawing a data figure with matplotlib/seaborn — copy the template and style file, fill real data, experiment-run, stop when PDF/PNG land in the figures folder. Not for architecture/schematics (→ figure-tikz), Observable Plot vocab (→ figure-observable-plot), manuscript wiring (→ figure-pipeline), or chat panel cards (→ figure-interaction).
license: MIT
---

# Figure: Matplotlib & Seaborn

Start from the shipped template and style file. Run it. When the PDF is in
the figures folder, the job is done.

**Backends**: matplotlib first; seaborn is the same pipeline. Other
backends or 3D only when the user asks.

## Pick one lane

| Ask | Start from | Then |
|-----|------------|------|
| One panel (loss curve, bar, scatter, …) | `scripts/plot_template.py` | Closed path below |
| Multi-panel (2×2, shared colorbar) | `scripts/plot_multipanel.py` | Same four beats |
| Architecture / schematic | — | **Stop.** `figure-tikz` |
| Density / hexbin / facets / geo | — | **Stop.** `figure-observable-plot` |

Do not start from an empty `pyplot` script.

## Closed path

Four steps. No reconnaissance.

1. **Copy both files** — this skill's `scripts/plot_template.py` (or
   `plot_multipanel.py`) **and** `assets/prism.mplstyle` into the experiment
   island or scripts folder. The template loads the style next to itself;
   copying the script alone drops the style. Rename the script to the
   figure.
2. **Fill data in that script** — load from a run artifact or a real CSV
   on disk. Keep loading and plotting in the same file. Axis labels include
   units. Use the style file's cycle; do not invent a palette. Output
   directory = the project's figures folder (Workspace Folder Descriptions
   — do not guess `figures/` if the project uses another name).
3. **Run** — `experiment-run` (project venv injected). If `import
   matplotlib` fails: `uv pip install matplotlib numpy` into
   `.prismnext/.venv` only — never the system Python, never `which python`.
   On error: edit the script, run again.
4. **Stop.** Chat already previews the PDF/PNG.

**Done** = that PDF (and preview PNG) exist. One short sentence in chat
(what the figure shows). Nothing else.

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
- PDF for print; PNG is the chat preview the template already writes.
- `references/chart-selection.md` only when the chart type is actually
  unclear. `references/colorblind-palettes.md` only when you must leave
  the style cycle. `references/figure-qc.md` only before submission.
