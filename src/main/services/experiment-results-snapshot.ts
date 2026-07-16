/**
 * Read-only scan of an experiment lab island for figures / tables / metrics.
 * Does **not** write the registry (Phase 4 / P2.4).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { toProjectRelativeArtifact } from "../../shared/artifact-path";
import {
  isSafeExperimentId,
  type ExperimentMeta,
} from "../../shared/experiment-log";
import {
  readExperiment,
  type ExperimentStorageContext,
  workspaceIslandPathForId,
} from "./experiment-log-service";

const SKIP_DIR_NAMES = new Set([
  ".venv",
  "venv",
  "node_modules",
  "__pycache__",
  ".git",
  ".prismnext",
]);
const FIGURE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".pdf"]);
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_FILES = 80;
const TEXT_SUMMARY_MAX = 2048;

export interface SnapshotFigure {
  path: string;
  kind: string;
}

export interface SnapshotTable {
  path: string;
  columns: string[];
  rowCount: number;
}

export interface SnapshotMetrics {
  path: string;
  values: Record<string, number | string>;
}

export interface ExperimentResultsSnapshot {
  id: string;
  workspacePath: string;
  figures: SnapshotFigure[];
  tables: SnapshotTable[];
  metrics: SnapshotMetrics[];
  /** Compact markdown ≤ 2KB for agent context. */
  textSummary: string;
  /** Files seen but not classified — agent may `read` them. */
  unparsed: string[];
  warnings: string[];
}

export interface SnapshotExperimentOptions {
  scanDirs?: string[];
  metricsFiles?: string[];
  maxFiles?: number;
  maxDepth?: number;
}

function labRel(islandAbs: string, abs: string): string {
  return relative(islandAbs, abs).replace(/\\/g, "/");
}

function walkFiles(
  rootAbs: string,
  islandAbs: string,
  depth: number,
  maxDepth: number,
  maxFiles: number,
  out: string[],
): void {
  if (out.length >= maxFiles || depth > maxDepth || !existsSync(rootAbs)) return;
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= maxFiles) return;
    const name = ent.name;
    if (name.startsWith(".") && name !== ".gitkeep") {
      if (SKIP_DIR_NAMES.has(name)) continue;
      if (ent.isDirectory()) continue;
    }
    const abs = join(rootAbs, name);
    if (ent.isDirectory()) {
      if (SKIP_DIR_NAMES.has(name)) continue;
      walkFiles(abs, islandAbs, depth + 1, maxDepth, maxFiles, out);
      continue;
    }
    if (ent.isFile()) out.push(abs);
  }
}

function parseCsv(abs: string): SnapshotTable | null {
  let text: string;
  try {
    text = readFileSync(abs, "utf-8");
  } catch {
    return null;
  }
  if (text.length > 2_000_000) return null;
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  const header = lines[0]!;
  const columns = header.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  return { path: "", columns, rowCount: Math.max(0, lines.length - 1) };
}

function parseMetricsJson(abs: string): SnapshotMetrics | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(abs, "utf-8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) values[k] = v;
    else if (typeof v === "string" && v.length <= 200) values[k] = v;
  }
  if (Object.keys(values).length === 0) return null;
  return { path: "", values };
}

function buildTextSummary(snap: Omit<ExperimentResultsSnapshot, "textSummary">): string {
  const lines: string[] = [
    `## Results snapshot — ${snap.id}`,
    `Lab: \`${snap.workspacePath}\``,
    "",
  ];
  if (snap.figures.length) {
    lines.push(`### Figures (${snap.figures.length})`);
    for (const f of snap.figures.slice(0, 12)) {
      const projectRel = toProjectRelativeArtifact(f.path, snap.workspacePath);
      lines.push(`- \`${projectRel}\` (${f.kind})`);
    }
    if (snap.figures.length > 12) lines.push(`- … +${snap.figures.length - 12} more`);
    lines.push("");
  }
  if (snap.tables.length) {
    lines.push(`### Tables (${snap.tables.length})`);
    for (const t of snap.tables.slice(0, 8)) {
      const projectRel = toProjectRelativeArtifact(t.path, snap.workspacePath);
      lines.push(
        `- \`${projectRel}\` — ${t.rowCount} rows · cols: ${t.columns.slice(0, 8).join(", ")}`,
      );
    }
    lines.push("");
  }
  if (snap.metrics.length) {
    lines.push(`### Metrics (${snap.metrics.length})`);
    for (const m of snap.metrics.slice(0, 8)) {
      const projectRel = toProjectRelativeArtifact(m.path, snap.workspacePath);
      const pairs = Object.entries(m.values)
        .slice(0, 6)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(`- \`${projectRel}\`: ${pairs}`);
    }
    lines.push("");
  }
  if (snap.unparsed.length) {
    lines.push(`### Unparsed (${snap.unparsed.length}) — use read on these`);
    for (const p of snap.unparsed.slice(0, 10)) lines.push(`- \`${p}\``);
    lines.push("");
  }
  if (snap.warnings.length) {
    lines.push("### Warnings");
    for (const w of snap.warnings) lines.push(`- ${w}`);
  }
  let text = lines.join("\n").trim();
  if (text.length > TEXT_SUMMARY_MAX) {
    text = `${text.slice(0, TEXT_SUMMARY_MAX - 20).trimEnd()}\n…(truncated)`;
  }
  return text;
}

export function snapshotExperiment(
  ctx: ExperimentStorageContext,
  id: string,
  opts?: SnapshotExperimentOptions,
): { ok: true; snapshot: ExperimentResultsSnapshot } | { ok: false; error: string } {
  if (!isSafeExperimentId(id)) return { ok: false, error: "invalid_id" };
  const read = readExperiment(ctx, id, 1);
  if (!read.ok) return { ok: false, error: read.error };
  const meta: ExperimentMeta = read.meta;
  const islandAbs = workspaceIslandPathForId(ctx, id);
  if (!islandAbs || !existsSync(islandAbs)) {
    return { ok: false, error: "experiment_not_found" };
  }

  const maxFiles = opts?.maxFiles && opts.maxFiles > 0 ? Math.min(opts.maxFiles, 200) : DEFAULT_MAX_FILES;
  const maxDepth = opts?.maxDepth && opts.maxDepth > 0 ? Math.min(opts.maxDepth, 8) : DEFAULT_MAX_DEPTH;
  /** Optional subdirectory roots; when omitted, scan the whole island. */
  const scanDirs = (opts?.scanDirs ?? [])
    .map((d) => d.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter((d) => d && !d.includes(".."));

  const warnings: string[] = [];
  const fileAbsList: string[] = [];

  if (scanDirs.length === 0) {
    walkFiles(islandAbs, islandAbs, 0, maxDepth, maxFiles, fileAbsList);
  } else {
    for (const dir of scanDirs) {
      const root = join(islandAbs, dir);
      if (!existsSync(root)) continue;
      try {
        if (!statSync(root).isDirectory()) continue;
      } catch {
        continue;
      }
      walkFiles(root, islandAbs, 0, maxDepth, maxFiles, fileAbsList);
    }
  }

  // Optional explicit metrics files (lab-relative).
  if (opts?.metricsFiles?.length) {
    for (const rel of opts.metricsFiles) {
      const clean = rel.replace(/\\/g, "/").replace(/^\.\//, "");
      if (!clean || clean.includes("..")) continue;
      const abs = join(islandAbs, clean);
      if (existsSync(abs) && !fileAbsList.includes(abs)) fileAbsList.push(abs);
    }
  }

  if (fileAbsList.length >= maxFiles) {
    warnings.push(`Scan capped at ${maxFiles} files.`);
  }

  const figures: SnapshotFigure[] = [];
  const tables: SnapshotTable[] = [];
  const metrics: SnapshotMetrics[] = [];
  const unparsed: string[] = [];

  for (const abs of fileAbsList) {
    const pathRel = labRel(islandAbs, abs);
    const ext = extname(abs).toLowerCase();
    if (FIGURE_EXT.has(ext)) {
      figures.push({ path: pathRel, kind: ext.slice(1) });
      continue;
    }
    if (ext === ".csv" || ext === ".tsv") {
      const table = parseCsv(abs);
      if (table) {
        tables.push({ ...table, path: pathRel });
        continue;
      }
    }
    if (ext === ".json") {
      const m = parseMetricsJson(abs);
      if (m) {
        metrics.push({ ...m, path: pathRel });
        continue;
      }
    }
    unparsed.push(pathRel);
  }

  const base = {
    id,
    workspacePath: meta.workspacePath,
    figures,
    tables,
    metrics,
    unparsed,
    warnings,
  };
  return {
    ok: true,
    snapshot: {
      ...base,
      textSummary: buildTextSummary(base),
    },
  };
}

/** Exported for tests — dirname of a lab-relative path. */
export function snapshotParentDir(labRelPath: string): string {
  return dirname(labRelPath.replace(/\\/g, "/"));
}
