/**
 * Interaction plot.* — CSV → series points (Observable Plot renders in UI).
 * No synthetic / demo points: numbers must come from a real CSV on disk.
 */

import type { InteractionResource } from "./interaction-spec";

export const INTERACTION_PLOT_KINDS = ["plot.line", "plot.series", "plot.scatter"] as const;

export type InteractionPlotKind = (typeof INTERACTION_PLOT_KINDS)[number];

export type PlotSeriesPoint = {
  x: number;
  y: number;
  series: string;
};

export type PlotDataResult =
  | { ok: true; points: PlotSeriesPoint[]; xLabel?: string; yLabel?: string }
  | { ok: false; error: string };

export const MAX_PLOT_CSV_BYTES = 2_000_000;

export function isInteractionPlotKind(kind: string): boolean {
  return (INTERACTION_PLOT_KINDS as readonly string[]).includes(kind.trim());
}

export function parsePlotParams(params?: Record<string, unknown>): {
  xCol: string;
  yCols: string[];
} {
  const xCol =
    typeof params?.x === "string" && params.x.trim() ? params.x.trim() : "epoch";
  const yRaw = params?.y;
  if (Array.isArray(yRaw)) {
    const yCols = yRaw
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((s) => s.trim());
    if (yCols.length > 0) return { xCol, yCols };
  }
  if (typeof yRaw === "string" && yRaw.trim()) {
    return { xCol, yCols: [yRaw.trim()] };
  }
  return { xCol, yCols: ["train_loss", "val_loss"] };
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

export function csvRowsToPlotPoints(
  rows: Record<string, string>[],
  columns: string[],
  xCol: string,
  yCols: string[],
): PlotDataResult {
  if (!columns.includes(xCol)) {
    return { ok: false, error: `missing x column "${xCol}"` };
  }
  for (const y of yCols) {
    if (!columns.includes(y)) {
      return { ok: false, error: `missing y column "${y}"` };
    }
  }

  const points: PlotSeriesPoint[] = [];
  for (const row of rows) {
    const x = Number(row[xCol]?.trim());
    if (!Number.isFinite(x)) continue;
    for (const series of yCols) {
      const y = Number(row[series]?.trim());
      if (!Number.isFinite(y)) continue;
      points.push({ x, y, series });
    }
  }

  if (points.length === 0) {
    return { ok: false, error: "no numeric rows in selected columns" };
  }

  return {
    ok: true,
    points,
    xLabel: xCol,
    yLabel: yCols.length === 1 ? yCols[0] : undefined,
  };
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
