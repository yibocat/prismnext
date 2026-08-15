---
name: figure-observable-plot
description: Use when a data figure needs Observable Plot's chart vocabulary — density contours, hexbin, faceted small multiples, heatmap cells, geo/graticule views, or Plot's polished default aesthetics — rendered headless to manuscript-grade SVG from a spec + CSV in the experiment island. Not for ordinary 2D line/bar/scatter (figure-matplotlib is the default lane), not for panel CSV charts (figure-interaction), not for diagrams (figure-tikz).
license: MIT
---

# Figure: Observable Plot (SVG lane)

Observable Plot covers chart types matplotlib reaches awkwardly — density
contours, hexbins, faceted small multiples, cell heatmaps, geographic
views — with a refined default grammar. This skill renders a Plot spec to
**SVG** headless, inside the experiment island, with the run recorded like
any other verification: **spec + CSV → experiment-run → SVG artifact →
manuscript wiring**.

The renderer (`scripts/render_plot.mjs`) runs on the app's own bundled
`@observablehq/plot` + `jsdom` — nothing to install. `experiment-run`
injects `$PRISM_NODE` (a Node runtime) and `$PRISM_APP_NODE_MODULES` (dep
resolution) into every run automatically.

## When to use

- Density contours / 2D density clouds over scatter underlays
- Hexbin heatmaps for large point clouds
- Faceted small multiples (`fx`/`fy`) — one lattice, many subsets
- Cell/tile heatmaps with continuous color (viridis etc.)
- Geographic / graticule views (see `references/plot-recipes.md`; topojson
assets are the user's data, resolution noted there)
- Any figure where Plot's default polish beats a hand-tuned matplotlib



## When NOT to use

- Ordinary 2D line/bar/scatter for the manuscript → `figure-matplotlib`
(default lane; its style file and journal sizing already fit the paper).
- Quick reopenable panel charts → `figure-interaction` CSV plots.
- Structural diagrams, commutative diagrams → `figure-tikz`.
- Interactive / animated / 3D views — this lane renders static SVG only.



## Lane discipline

1. **Spec + data live in the island.** Copy `templates/plot-spec.mjs`,
  fill in the marks; the CSV comes from a real run artifact. No invented
   series — same rule as every figure lane.
2. **Run via** `experiment-run`**:**
  ```bash
   "$PRISM_NODE" render_plot.mjs spec.mjs --data results.csv --out fig-density.svg
  ```
   Quote `$PRISM_NODE` (paths may contain spaces). Exit 0/1 contracts and
   runs.jsonl provenance apply as usual; declare the SVG in `artifacts`.
3. **SVG is the manuscript asset.** For LaTeX, convert to PDF (e.g.
  `cairosvg` in the project venv) or include via `\includesvg`; then wire
   with `figure-pipeline` as usual.
4. **The spec returns an options object**, not a DOM element — the
  renderer injects the JSDOM document. `d3` may be null; prefer plain JS
   in specs (see the template).



## Files in this skill

- `scripts/render_plot.mjs` — headless renderer: spec + CSV → SVG, with
dependency resolution ($PRISM_APP_NODE_MODULES → upward node_modules)
and clear failure messages.
- `templates/plot-spec.mjs` — copyable spec: line+density example with the
options-object contract.
- `references/plot-recipes.md` — tested Plot recipes: density, hexbin,
facets, cell heatmap, dot+color encoding, geo/graticule, and the
options-object contract details.



## Done when

- `experiment-run` exits 0 and the SVG is in the island's artifacts.
- The SVG opens correctly (panel preview or browser) — marks, legend,
and labels all present.
- The manuscript wiring references the regenerated asset, and the spec
still runs from scratch (regenerate discipline).



## Rules

- One spec answers one visual question; a second comparison is a second
spec, not more marks crammed in.
- Categorical colors: Okabe-Ito (`#0072B2 #E69F00 #009E73 #D55E00 #CC79A7 #56B4E9 #F0E442`). Continuous: viridis-family — never jet.
- Keep text legible at the target column width (see figure-matplotlib's
`references/journal-sizing.md`) — set explicit `width`/`height` and
`style.fontSize` in the spec.
- The renderer never invents data: if the CSV is missing or empty, the
run fails — fix the data, not the error.

