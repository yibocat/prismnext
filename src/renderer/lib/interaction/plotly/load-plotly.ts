/**
 * Lazy plotly.js loader — bundled locally (no CDN), shared across panels.
 */
export type PlotlyModule = typeof import("plotly.js-dist-min");

let plotlyPromise: Promise<PlotlyModule> | null = null;

export function loadPlotly(): Promise<PlotlyModule> {
  if (!plotlyPromise) {
    plotlyPromise = import("plotly.js-dist-min").then(
      (m) => (m.default ?? m) as unknown as PlotlyModule,
    );
  }
  return plotlyPromise;
}
