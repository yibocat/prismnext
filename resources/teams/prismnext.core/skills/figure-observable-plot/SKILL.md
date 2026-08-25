---
name: figure-observable-plot
description: Use when a data figure needs Observable Plot's chart vocabulary — density, hexbin, facets, cell heatmap, geo — spec + CSV → experiment-run → SVG, then stop. Ordinary line/bar/scatter → figure-matplotlib. Diagrams → figure-tikz. Panel cards → figure-interaction. Manuscript include → figure-pipeline, and only if the user asked.
license: MIT
---

# Figure: Observable Plot (SVG lane)

Chart types matplotlib reaches awkwardly, rendered headless to **SVG**.
The loop is **spec + CSV → experiment-run → SVG**. When the SVG exists,
the job is done.

The renderer (`scripts/render_plot.mjs`) uses the app's bundled
`@observablehq/plot` + `jsdom` — nothing to install. `experiment-run`
injects `$PRISM_NODE` and `$PRISM_APP_NODE_MODULES`.

## When to use

- Density contours / 2D density over scatter
- Hexbin for large point clouds
- Faceted small multiples (`fx`/`fy`)
- Cell/tile heatmaps (viridis-family, never jet)
- Geographic / graticule views (`references/plot-recipes.md`; topojson is
  the user's data)

## When not

- Ordinary 2D line/bar/scatter → `figure-matplotlib`
- Architecture / commutative diagrams → `figure-tikz`
- "Make a reopenable card" → `figure-interaction` (file must exist first)
- Interactive / animated / 3D — this lane is static SVG only

## Closed path

1. **Copy** this skill's `templates/plot-spec.mjs` and
   `scripts/render_plot.mjs` into the experiment island. Fill the spec
   from a real run CSV — no invented series. The spec returns an **options
   object**, not a DOM node (`d3` may be null; prefer plain JS).
2. **Run** via `experiment-run`:
   ```bash
   "$PRISM_NODE" render_plot.mjs spec.mjs --data results.csv --out fig-density.svg
   ```
   Quote `$PRISM_NODE`. Declare the SVG in `artifacts`. Empty/missing CSV
   must fail the run — fix the data, not the error.
3. **Stop.** Chat can preview the SVG.

**Done** = `experiment-run` exits 0 and the SVG is in the island
artifacts. One short sentence in chat.

**Do not** (unless the user named that next step):

- Convert SVG → PDF (`cairosvg`, `sips`, `gs`) so LaTeX or "looking"
  works — the SVG is the figure
- `figure-pipeline` / `\includesvg` / `latex-compile`
- `interaction-write`

`references/plot-recipes.md` only when the mark type is unclear.

## Rules

- One spec, one visual question.
- Categorical: Okabe-Ito (`#0072B2 #E69F00 #009E73 #D55E00 #CC79A7
  #56B4E9 #F0E442`). Continuous: viridis-family.
- Set explicit `width` / `height` / `style.fontSize` in the spec.
