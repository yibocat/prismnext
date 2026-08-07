/**
 * Shared Observable Plot spec builder for interaction plot.* objects.
 * Used by the RightArea plot view and the chat thumbnail peek — the only
 * difference between them is `compact` (labels/legend/margins/font size).
 *
 * Color discipline follows figure-interaction: categorical scales use the
 * Okabe-Ito colorblind-safe range; continuous scales (density/heatmap) use
 * viridis. Background stays transparent so the panel theme shows through.
 */

import type { PlotDataResult } from "../../../../shared/interaction-plot";

type PlotNS = typeof import("@observablehq/plot");
type Markish = import("@observablehq/plot").Markish;

export const OKABE_ITO_RANGE = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#D55E00",
  "#CC79A7",
  "#56B4E9",
  "#F0E442",
  "#000000",
] as const;

type PlotData = Extract<PlotDataResult, { ok: true }>;

const CATEGORICAL_KINDS = new Set([
  "plot.line",
  "plot.series",
  "plot.scatter",
  "plot.area",
  "plot.bar",
]);

export function buildPlotOptions(
  Plot: PlotNS,
  data: PlotData,
  size: { width: number; height: number },
  opts: { compact: boolean },
): Parameters<PlotNS["plot"]>[0] {
  const { compact } = opts;
  const { width, height } = size;

  const marks: Markish[] = [];
  switch (data.kind) {
    case "plot.scatter":
      marks.push(
        Plot.dot(data.points, {
          x: "x",
          y: "y",
          fill: "series",
          r: compact ? 2 : 2.5,
          fillOpacity: 0.75,
        }),
      );
      break;
    case "plot.area":
      marks.push(
        Plot.areaY(data.points, {
          x: "x",
          y: "y",
          fill: "series",
          fillOpacity: 0.7,
        }),
        Plot.line(data.points, { x: "x", y: "y", stroke: "series", strokeWidth: 1.25 }),
        Plot.ruleY([0]),
      );
      break;
    case "plot.bar":
      marks.push(
        Plot.barY(data.rows, { x: "x", y: "y", fill: "series" }),
        Plot.ruleY([0]),
      );
      break;
    case "plot.histogram":
      marks.push(
        Plot.rectY(
          data.rows,
          Plot.binX(
            { y: "count" },
            { x: "x", ...(data.bins ? { thresholds: data.bins } : {}) },
          ),
        ),
        Plot.ruleY([0]),
      );
      break;
    case "plot.box":
      marks.push(Plot.boxY(data.rows, { x: "x", y: "y" }));
      break;
    case "plot.density":
      marks.push(
        Plot.density(data.points, {
          x: "x",
          y: "y",
          fill: "density",
          stroke: "density",
          fillOpacity: 0.55,
          ...(data.bins ? { thresholds: data.bins } : {}),
        }),
        Plot.dot(data.points, {
          x: "x",
          y: "y",
          r: compact ? 0.75 : 1,
          fill: "currentColor",
          fillOpacity: 0.12,
        }),
      );
      break;
    case "plot.heatmap":
      marks.push(
        Plot.cell(data.rows, { x: "x", y: "y", fill: "fill", inset: 0.5 }),
      );
      break;
    case "plot.line":
    case "plot.series":
    default:
      marks.push(
        Plot.line(data.points, {
          x: "x",
          y: "y",
          stroke: "series",
          strokeWidth: compact ? 1.75 : 2,
        }),
      );
      break;
  }

  const color = CATEGORICAL_KINDS.has(data.kind)
    ? {
        range: [...OKABE_ITO_RANGE],
        legend: !compact && data.legend,
      }
    : data.kind === "plot.box" || data.kind === "plot.histogram"
      ? undefined
      : {
          // plot.density / plot.heatmap — continuous viridis
          scheme: "viridis" as const,
          legend: !compact && data.legend,
          ...(data.kind === "plot.heatmap" && data.fillCol
            ? { label: data.fillCol }
            : {}),
        };

  const bandX = data.kind === "plot.bar" || data.kind === "plot.box";

  return {
    width,
    height,
    marginLeft: compact ? Math.min(44, Math.max(28, Math.round(width * 0.12))) : 56,
    marginBottom: compact ? Math.min(36, Math.max(22, Math.round(height * 0.22))) : 48,
    marginTop: compact ? 6 : 32,
    marginRight: compact ? 6 : 20,
    x: {
      label: compact ? null : (data.xLabel ?? "x"),
      grid: !bandX,
    },
    y: {
      label: compact ? null : (data.yLabel ?? "y"),
      grid: true,
    },
    ...(color ? { color } : {}),
    marks,
    style: {
      background: "transparent",
      color: "var(--foreground)",
      fontFamily: "var(--font-sans)",
      fontSize: compact ? "9px" : "11px",
      overflow: "visible",
    },
  };
}
