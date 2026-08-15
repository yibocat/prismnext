# Observable Plot recipes (headless SVG lane)

Every recipe assumes the spec contract from `templates/plot-spec.mjs`:

```js
export default ({ Plot, rows, columns, d3 }) => ({ /* Plot.plot() options */ });
```

`rows` = CSV records, numeric cells already coerced. `d3` may be null —
write plain JS transforms (`rows.map`, `rows.filter`, …) instead of
d3-array helpers when you can.

## Density contours (2D density cloud)

```js
marks: [
  Plot.density(rows, { x: "x", y: "y", fill: "density", stroke: "density",
                       fillOpacity: 0.6, bandwidth: 12 }),
  Plot.dot(rows, { x: "x", y: "y", r: 1, fillOpacity: 0.15 }),
]
// color: { scheme: "viridis", legend: true }
```

`bandwidth` (pixels) is the smoothing knob — show the raw dots under the
contours so smoothing is visible, never silent.

## Hexbin heatmap (large point clouds)

```js
marks: [
  Plot.hexagon(rows, Plot.hexbin({ fill: "count" }, { x: "x", y: "y", binWidth: 14 })),
]
// color: { scheme: "viridis", legend: true, label: "count" }
```



## Faceted small multiples

```js
{
  facet: { data: rows, x: "condition", marginRight: 70 },
  marks: [
    Plot.lineY(rows, { x: "t", y: "score" }),
    Plot.ruleY([0]),
  ],
  fx: { label: "condition" },
}
```

One lattice, one shared scale by default — that shared scale is what makes
facets honest. Add `fx: { domain: [...] }` to control panel order.

## Cell heatmap (matrix / correlation views)

```js
marks: [Plot.cell(rows, { x: "i", y: "j", fill: "v", inset: 0.5 })]
// color: { scheme: "viridis", legend: true, label: "v" }
```

Diverging data (correlations, residuals): `color: { scheme: "RdBu", legend: true }` and force symmetry with `domain: [-1, 1]`.

## Dot plot with color encoding

```js
marks: [Plot.dot(rows, { x: "culmen_length", y: "culmen_depth",
                         stroke: "species", r: 2.5, fillOpacity: 0.8 })]
// color: { range: ["#0072B2", "#E69F00", "#009E73"], legend: true }
```

Prefer `stroke` over `fill` for overlapping clouds (hollow circles read
better); add `Plot.tip` only in interactive contexts — this lane is static.

## Grouped / stacked bars

```js
marks: [Plot.barY(rows, { x: "model", y: "score", fill: "variant" }),
        Plot.ruleY([0])]
```

Stacked is the default when `fill` is present. For grouped (dodged) bars,
use the `fx` trick: `{ fx: "model", x: "variant", y: "score", fill: "variant" }`.

## Geographic / graticule views

No topojson asset is bundled — the user supplies geometry. Two tiers:

```js
// Graticule + sphere only (no assets needed):
marks: [
  Plot.graticule(),
  Plot.sphere(),
  Plot.dot(rows, { x: "lon", y: "lat", r: 2, fillOpacity: 0.6 }),
]
// projection: "equal-earth"
```

With a topojson file: the spec receives no file loader — read the JSON in
the spec via `import` (JSON modules) or keep geometry in the CSV lane and
skip true polygons. For real basemap work, generate the topojson-derived
JSON next to the spec and `await import("./land.json", { with: { type: "json" } })`
— the spec function may be `async`.

## Sizing for the manuscript

- Set explicit `width`/`height` in px: a 3.5 in column at 150 px/in ≈
`width: 520`; keep `style: { fontSize: "11px" }` or larger at that width.
- SVG stays vector in the PDF pipeline — convert with cairosvg for LaTeX
(`uv pip install cairosvg`, then a one-line Python call) or `\includesvg`.



## Pitfalls

- **Options object, not an element.** Returning `Plot.plot(...)` from the
spec fails — the renderer injects `document` itself.
- **Legends are extra marks only when needed.** `color: { legend: true }`
for encodings; omit legends for single-series plots.
- **Fonts render as SVG text.** The manuscript pipeline treats them as
vector text; keep one family (default system sans) across JS figures.
- **Determinism:** binning/density are deterministic; if the spec uses
randomness (jitter), seed it inside the spec so the run reproduces.

