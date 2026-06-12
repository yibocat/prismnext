// lib/theme/chart-palettes.ts
// Chart color schemes for data visualization. Each scheme has light + dark variants.

export type ChartSchemeId = "default" | "vivid" | "pastel" | "monochrome";

export interface ChartPalette {
  light: [string, string, string, string, string];
  dark: [string, string, string, string, string];
}

const DEFAULT_CHART: ChartPalette = {
  light: [
    "oklch(0.646 0.222 41.116)",
    "oklch(0.6 0.118 184.704)",
    "oklch(0.398 0.07 227.392)",
    "oklch(0.828 0.189 84.429)",
    "oklch(0.769 0.188 70.08)",
  ],
  dark: [
    "oklch(0.488 0.243 264.376)",
    "oklch(0.696 0.17 162.48)",
    "oklch(0.769 0.188 70.08)",
    "oklch(0.627 0.265 303.9)",
    "oklch(0.645 0.246 16.439)",
  ],
};

const VIVID_CHART: ChartPalette = {
  light: [
    "oklch(0.62 0.25 30)",
    "oklch(0.58 0.22 160)",
    "oklch(0.52 0.25 260)",
    "oklch(0.65 0.22 50)",
    "oklch(0.55 0.25 320)",
  ],
  dark: [
    "oklch(0.70 0.22 30)",
    "oklch(0.66 0.18 160)",
    "oklch(0.62 0.22 260)",
    "oklch(0.72 0.18 50)",
    "oklch(0.65 0.22 320)",
  ],
};

const PASTEL_CHART: ChartPalette = {
  light: [
    "oklch(0.80 0.08 30)",
    "oklch(0.78 0.06 160)",
    "oklch(0.76 0.08 260)",
    "oklch(0.82 0.06 50)",
    "oklch(0.78 0.08 320)",
  ],
  dark: [
    "oklch(0.45 0.10 30)",
    "oklch(0.42 0.08 160)",
    "oklch(0.40 0.10 260)",
    "oklch(0.48 0.08 50)",
    "oklch(0.44 0.10 320)",
  ],
};

const MONOCHROME_CHART: ChartPalette = {
  light: [
    "oklch(0.30 0.02 260)",
    "oklch(0.45 0.02 260)",
    "oklch(0.60 0.02 260)",
    "oklch(0.70 0.02 260)",
    "oklch(0.85 0.02 260)",
  ],
  dark: [
    "oklch(0.85 0.02 260)",
    "oklch(0.70 0.02 260)",
    "oklch(0.55 0.02 260)",
    "oklch(0.40 0.02 260)",
    "oklch(0.25 0.02 260)",
  ],
};

export const CHART_PALETTES: Record<ChartSchemeId, ChartPalette> = {
  default: DEFAULT_CHART,
  vivid: VIVID_CHART,
  pastel: PASTEL_CHART,
  monochrome: MONOCHROME_CHART,
};

export const CHART_SCHEME_LABELS: Record<ChartSchemeId, string> = {
  default: "Default",
  vivid: "Vivid",
  pastel: "Pastel",
  monochrome: "Monochrome",
};
