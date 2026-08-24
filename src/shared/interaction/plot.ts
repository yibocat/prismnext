/**
 * Interaction plot.* — CSV → series points / rows (Observable Plot renders in UI).
 * No synthetic / demo points: numbers must come from a real CSV on disk.
 *
 * Kinds:
 *  - plot.line / plot.series / plot.scatter — numeric x/y, melted by series
 *  - plot.area     — same points, stacked fill
 *  - plot.bar      — categorical x, numeric y (multi-y stacks by series)
 *  - plot.histogram — one numeric column, binned (params.bins optional)
 *  - plot.box      — categorical x + one numeric y
 *  - plot.density  — numeric x/y density contours over a faint dot underlay
 *  - plot.heatmap  — x/y/fill matrix cells (params.fill required)
 */

import type { InteractionResource } from "./spec";

export const INTERACTION_PLOT_KINDS = [
  "plot.line",
  "plot.series",
  "plot.scatter",
  "plot.area",
  "plot.bar",
  "plot.histogram",
  "plot.box",
  "plot.density",
  "plot.heatmap",
] as const;

export type InteractionPlotKind = (typeof INTERACTION_PLOT_KINDS)[number];

export type PlotSeriesPoint = {
  x: number;
  y: number;
  series: string;
};

/** Normalized row for non-point kinds (bar/box/histogram/heatmap). */
export type PlotRow = Record<string, number | string>;

export type PlotParams = {
  xCol: string;
  yCols: string[];
  fillCol: string | null;
  bins: number | null;
};

export type PlotDataResult =
  | {
      ok: true;
      kind: InteractionPlotKind;
      /** Numeric x/y melt — line/series/scatter/area/density. */
      points: PlotSeriesPoint[];
      /** Normalized rows — bar/box/histogram/heatmap. */
      rows: PlotRow[];
      xCol: string;
      yCols: string[];
      fillCol: string | null;
      bins: number | null;
      xLabel?: string;
      yLabel?: string;
      /** Whether a color legend carries information for this data set. */
      legend: boolean;
    }
  | { ok: false; error: string };

export const MAX_PLOT_CSV_BYTES = 2_000_000;

export function isInteractionPlotKind(kind: string): boolean {
  return (INTERACTION_PLOT_KINDS as readonly string[]).includes(kind.trim());
}

export function parsePlotParams(params?: Record<string, unknown>): PlotParams {
  const xCol =
    typeof params?.x === "string" && params.x.trim() ? params.x.trim() : "epoch";
  const yRaw = params?.y;
  let yCols: string[] = [];
  if (Array.isArray(yRaw)) {
    yCols = yRaw
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((s) => s.trim());
  } else if (typeof yRaw === "string" && yRaw.trim()) {
    yCols = [yRaw.trim()];
  }
  if (yCols.length === 0) yCols = ["train_loss", "val_loss"];
  const fillCol =
    typeof params?.fill === "string" && params.fill.trim() ? params.fill.trim() : null;
  const binsRaw = params?.bins;
  const bins =
    typeof binsRaw === "number" && Number.isFinite(binsRaw) && binsRaw >= 2
      ? Math.min(Math.floor(binsRaw), 500)
      : null;
  return { xCol, yCols, fillCol, bins };
}

export function parseSimpleCsv(
  text: string,
): { columns: string[]; rows: Record<string, string>[] } | null {
  if (text.length > MAX_PLOT_CSV_BYTES) return null;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const columns = parseCsvLine(lines[0]!);
  if (columns.length === 0) return null;
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    if (cells.length === 0) continue;
    const row: Record<string, string> = {};
    for (let c = 0; c < columns.length; c++) {
      row[columns[c]!] = cells[c] ?? "";
    }
    rows.push(row);
  }
  return rows.length > 0 ? { columns, rows } : null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(stripCsvCell(cur));
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(stripCsvCell(cur));
  return out;
}

function stripCsvCell(s: string): string {
  return s.trim().replace(/^"|"$/g, "");
}

function toNum(v: string | undefined): number | null {
  const n = Number((v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

function missing(columns: string[], col: string): string | null {
  return columns.includes(col) ? null : `missing column "${col}"`;
}

/**
 * Kind-aware CSV → render data. Every branch validates the columns it needs
 * and never fabricates values — non-numeric cells are dropped, and when
 * nothing survives the result is an explicit error.
 */
export function csvRowsToPlotData(
  rows: Record<string, string>[],
  columns: string[],
  kind: InteractionPlotKind,
  params: PlotParams,
): PlotDataResult {
  const { xCol, yCols, fillCol, bins } = params;

  const pointsMelt = (ys: string[]): PlotSeriesPoint[] => {
    const points: PlotSeriesPoint[] = [];
    for (const row of rows) {
      const x = toNum(row[xCol]);
      if (x === null) continue;
      for (const series of ys) {
        const y = toNum(row[series]);
        if (y === null) continue;
        points.push({ x, y, series });
      }
    }
    return points;
  };

  const base = {
    kind,
    xCol,
    yCols,
    fillCol,
    bins,
    xLabel: xCol,
    yLabel: yCols.length === 1 ? yCols[0] : undefined,
  };

  switch (kind) {
    case "plot.line":
    case "plot.series":
    case "plot.scatter":
    case "plot.area":
    case "plot.density": {
      const err = missing(columns, xCol);
      if (err) return { ok: false, error: err };
      for (const y of yCols) {
        const e = missing(columns, y);
        if (e) return { ok: false, error: e };
      }
      if (kind === "plot.density" && yCols.length !== 1) {
        return { ok: false, error: "plot.density takes exactly one y column" };
      }
      const points = pointsMelt(yCols);
      if (points.length === 0) {
        return { ok: false, error: "no numeric rows in selected columns" };
      }
      return {
        ok: true,
        ...base,
        points,
        rows: [],
        legend: yCols.length > 1 || kind === "plot.density",
      };
    }

    case "plot.histogram": {
      const err = missing(columns, xCol);
      if (err) return { ok: false, error: err };
      const out: PlotRow[] = [];
      for (const row of rows) {
        const v = toNum(row[xCol]);
        if (v !== null) out.push({ x: v });
      }
      if (out.length === 0) {
        return { ok: false, error: `no numeric values in column "${xCol}"` };
      }
      return {
        ok: true,
        ...base,
        points: [],
        rows: out,
        yLabel: "count",
        legend: false,
      };
    }

    case "plot.bar": {
      const err = missing(columns, xCol);
      if (err) return { ok: false, error: err };
      for (const y of yCols) {
        const e = missing(columns, y);
        if (e) return { ok: false, error: e };
      }
      const out: PlotRow[] = [];
      for (const row of rows) {
        const x = (row[xCol] ?? "").trim();
        if (!x) continue;
        for (const series of yCols) {
          const y = toNum(row[series]);
          if (y === null) continue;
          out.push({ x, y, series });
        }
      }
      if (out.length === 0) {
        return { ok: false, error: "no numeric rows in selected columns" };
      }
      return {
        ok: true,
        ...base,
        points: [],
        rows: out,
        legend: yCols.length > 1,
      };
    }

    case "plot.box": {
      const err = missing(columns, xCol) ?? missing(columns, yCols[0]!);
      if (err) return { ok: false, error: err };
      if (yCols.length !== 1) {
        return { ok: false, error: "plot.box takes exactly one y column" };
      }
      const out: PlotRow[] = [];
      for (const row of rows) {
        const x = (row[xCol] ?? "").trim();
        const y = toNum(row[yCols[0]!]);
        if (!x || y === null) continue;
        out.push({ x, y });
      }
      if (out.length === 0) {
        return { ok: false, error: "no numeric rows in selected columns" };
      }
      return { ok: true, ...base, points: [], rows: out, legend: false };
    }

    case "plot.heatmap": {
      if (!fillCol) {
        return { ok: false, error: 'plot.heatmap requires params.fill (the value column)' };
      }
      const err =
        missing(columns, xCol) ?? missing(columns, yCols[0]!) ?? missing(columns, fillCol);
      if (err) return { ok: false, error: err };
      if (yCols.length !== 1) {
        return { ok: false, error: "plot.heatmap takes exactly one y column" };
      }
      const out: PlotRow[] = [];
      for (const row of rows) {
        const x = (row[xCol] ?? "").trim();
        const y = (row[yCols[0]!] ?? "").trim();
        const fill = toNum(row[fillCol]);
        if (!x || !y || fill === null) continue;
        out.push({ x, y, fill });
      }
      if (out.length === 0) {
        return { ok: false, error: "no numeric fill values in selected columns" };
      }
      return { ok: true, ...base, points: [], rows: out, legend: true };
    }
  }
}

/**
 * Back-compat wrapper: the original numeric x/y melt (plot.series semantics).
 * New code should call csvRowsToPlotData with an explicit kind.
 */
export function csvRowsToPlotPoints(
  rows: Record<string, string>[],
  columns: string[],
  xCol: string,
  yCols: string[],
): PlotDataResult {
  return csvRowsToPlotData(rows, columns, "plot.series", {
    xCol,
    yCols,
    fillCol: null,
    bins: null,
  });
}

export function pickCsvResourcePath(resources?: InteractionResource[]): string | null {
  if (!resources?.length) return null;
  const dataRole = resources.find((r) => {
    const role = (r.role ?? "").toLowerCase();
    return (role === "data" || role === "csv") && r.path?.trim();
  });
  if (dataRole?.path) return dataRole.path.trim();
  const csv = resources.find((r) => r.path?.toLowerCase().endsWith(".csv"));
  if (csv?.path) return csv.path.trim();
  return null;
}

export function isCsvArtifactPath(path: string): boolean {
  return path.trim().toLowerCase().endsWith(".csv");
}
