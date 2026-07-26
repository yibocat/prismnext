/**
 * Interaction plot.* runtime — data prep (P1).
 * Rendering uses Observable Plot in the renderer; this module stays pure for tests.
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

/** Deterministic local sketch — no file I/O. */
export function buildLocalDemoPlotPoints(
  kind: string,
  yCols?: string[],
): PlotSeriesPoint[] {
  if (kind === "plot.scatter") {
    const points: PlotSeriesPoint[] = [];
    for (let i = 0; i < 120; i++) {
      const x = (i % 12) + (i % 7) * 0.13;
      const y = x * 0.75 + Math.sin(i * 0.4) * 0.35 + (i % 5) * 0.08;
      points.push({ x, y, series: yCols?.[0] ?? "samples" });
    }
    return points;
  }

  const seriesNames =
    yCols && yCols.length > 0 ? yCols : (["train_loss", "val_loss"] as const);
  const steps = 80;
  const points: PlotSeriesPoint[] = [];

  for (let i = 0; i < steps; i++) {
    const train = 2.5 * Math.exp(-i / 25) + 0.08 + Math.sin(i * 0.7) * 0.015;
    const val = 2.8 * Math.exp(-i / 30) + 0.15 + Math.cos(i * 0.5) * 0.02;
    const byName: Record<string, number> = {
      train_loss: train,
      val_loss: val,
      loss: train,
    };
    for (const name of seriesNames) {
      const y = byName[name] ?? train * (0.85 + (name.length % 5) * 0.03);
      points.push({ x: i, y, series: name });
    }
  }
  return points;
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
  const dataRole = resources.find((r) => r.role === "data" && r.path?.trim());
  if (dataRole?.path) return dataRole.path.trim();
  const csv = resources.find((r) => r.path?.toLowerCase().endsWith(".csv"));
  if (csv?.path) return csv.path.trim();
  const any = resources.find((r) => r.path?.trim());
  return any?.path?.trim() ?? null;
}
