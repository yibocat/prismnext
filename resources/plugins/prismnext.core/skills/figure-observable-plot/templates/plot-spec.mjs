/**
 * plot-spec.mjs — copy into the experiment island, fill in your marks.
 *
 * Contract: default-export a function receiving { Plot, rows, columns, d3 }
 * and returning a Plot.plot() OPTIONS OBJECT (the renderer injects the
 * document and serializes SVG). `rows` are the CSV records with numeric
 * cells already coerced to numbers. `d3` may be null — prefer plain JS.
 *
 * Run:
 *   "$PRISM_NODE" render_plot.mjs plot-spec.mjs --data results.csv --out fig.svg
 */

export default ({ Plot, rows /*, columns, d3 */ }) => ({
  width: 640,
  height: 400,
  marginLeft: 56,
  grid: true,
  // Categorical palette (Okabe-Ito) when you map a channel to color:
  color: {
    range: ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9"],
    legend: true,
  },
  style: { fontSize: "12px" },
  x: { label: "x quantity (unit)" },
  y: { label: "y quantity (unit)" },
  marks: [
    // Density contours over a faint scatter — replace with your marks:
    Plot.density(rows, { x: "x", y: "y", fill: "density", fillOpacity: 0.55 }),
    Plot.dot(rows, { x: "x", y: "y", r: 1.5, fillOpacity: 0.25 }),
  ],
});
