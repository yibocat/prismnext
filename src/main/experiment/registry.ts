/**
 * Experiment registry IO — meta.json, runs.jsonl, stats sidecar.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  EXPERIMENT_META_FILENAME,
  EXPERIMENT_RUNS_FILENAME,
  EXPERIMENT_RUNS_STATS_FILENAME,
  isSafeExperimentId,
  slugBaseFromTitle,
  type ExperimentMeta,
  type ExperimentRunEntry,
} from "../../shared/experiments/log";
import type { ExperimentStorageContext } from "./context";

export function registryEntryPath(ctx: ExperimentStorageContext, id: string): string {
  return join(ctx.registryRoot, id);
}

export function metaPath(ctx: ExperimentStorageContext, id: string): string {
  return join(registryEntryPath(ctx, id), EXPERIMENT_META_FILENAME);
}

export function runsPath(ctx: ExperimentStorageContext, id: string): string {
  return join(registryEntryPath(ctx, id), EXPERIMENT_RUNS_FILENAME);
}

function runsStatsPath(ctx: ExperimentStorageContext, id: string): string {
  return join(registryEntryPath(ctx, id), EXPERIMENT_RUNS_STATS_FILENAME);
}

interface RunsStats {
  runCount: number;
  lastRunAt: string | null;
}

export function writeRunsStats(ctx: ExperimentStorageContext, id: string, stats: RunsStats): void {
  try {
    writeFileSync(
      runsStatsPath(ctx, id),
      JSON.stringify(stats) + "\n",
      "utf-8",
    );
  } catch {
    // best-effort sidecar
  }
}

function readRunsStatsFile(ctx: ExperimentStorageContext, id: string): RunsStats | null {
  const sp = runsStatsPath(ctx, id);
  if (!existsSync(sp)) return null;
  try {
    const raw = JSON.parse(readFileSync(sp, "utf-8")) as Partial<RunsStats>;
    if (typeof raw.runCount !== "number" || raw.runCount < 0) return null;
    const lastRunAt =
      raw.lastRunAt === null || typeof raw.lastRunAt === "string" ? raw.lastRunAt : null;
    return { runCount: raw.runCount, lastRunAt };
  } catch {
    return null;
  }
}

/** Full scan of runs.jsonl — also heals the sidecar. */
function recountRunsAndLastAt(ctx: ExperimentStorageContext, id: string): RunsStats {
  const rp = runsPath(ctx, id);
  if (!existsSync(rp)) {
    const empty = { runCount: 0, lastRunAt: null as string | null };
    writeRunsStats(ctx, id, empty);
    return empty;
  }
  let runCount = 0;
  let lastRunAt: string | null = null;
  try {
    const raw = readFileSync(rp, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    runCount = lines.length;
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]!) as Partial<ExperimentRunEntry>;
        lastRunAt = last.finishedAt ?? last.startedAt ?? null;
      } catch {
        lastRunAt = null;
      }
    }
  } catch {
    // ignore
  }
  const stats = { runCount, lastRunAt };
  writeRunsStats(ctx, id, stats);
  return stats;
}

/**
 * Refresh sidecar after append (Bug #20). Prefer O(1) increment over a full
 * JSONL recount — only heal via full scan when the sidecar is missing.
 */
export function bumpRunsStats(
  ctx: ExperimentStorageContext,
  id: string,
  run?: Pick<ExperimentRunEntry, "finishedAt" | "startedAt">,
): void {
  const existing = readRunsStatsFile(ctx, id);
  if (!existing) {
    recountRunsAndLastAt(ctx, id);
    return;
  }
  const stamp = run?.finishedAt ?? run?.startedAt ?? null;
  writeRunsStats(ctx, id, {
    runCount: existing.runCount + 1,
    lastRunAt: stamp ?? existing.lastRunAt,
  });
}

export function workspaceIslandAbs(ctx: ExperimentStorageContext, meta: ExperimentMeta): string {
  return join(ctx.projectRoot, meta.workspacePath);
}

export function nowUtcIso(): string {
  return new Date().toISOString();
}

export function utcDateStamp(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function utcTimeStamp(d = new Date()): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}${m}${s}`;
}

export function shortHex(len = 4): string {
  return randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

/** Build a unique experiment id: `exp-YYYYMMDD-<base>-<shortid>`. */
export function generateExperimentSlug(registryRoot: string, title: string): string {
  const base = slugBaseFromTitle(title);
  const date = utcDateStamp();
  for (let attempt = 0; attempt < 12; attempt++) {
    const id = `exp-${date}-${base}-${shortHex(4)}`;
    if (!existsSync(join(registryRoot, id))) return id;
  }
  return `exp-${date}-${base}-${shortHex(8)}`;
}

type MetaReadResult =
  | { ok: true; meta: ExperimentMeta }
  | { ok: false; reason: "invalid_id" | "missing" | "corrupt" };

export function readMetaResult(ctx: ExperimentStorageContext, id: string): MetaReadResult {
  if (!isSafeExperimentId(id)) return { ok: false, reason: "invalid_id" };
  const mp = metaPath(ctx, id);
  if (!existsSync(mp)) return { ok: false, reason: "missing" };
  try {
    return { ok: true, meta: JSON.parse(readFileSync(mp, "utf-8")) as ExperimentMeta };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

export function readMeta(ctx: ExperimentStorageContext, id: string): ExperimentMeta | null {
  const r = readMetaResult(ctx, id);
  return r.ok ? r.meta : null;
}

export function writeMeta(ctx: ExperimentStorageContext, meta: ExperimentMeta): void {
  writeFileSync(metaPath(ctx, meta.id), JSON.stringify(meta, null, 2) + "\n", "utf-8");
}

export function experimentExists(ctx: ExperimentStorageContext, id: string): boolean {
  return readMeta(ctx, id) !== null;
}

export function countRunsAndLastAt(ctx: ExperimentStorageContext, id: string): RunsStats {
  const cached = readRunsStatsFile(ctx, id);
  if (cached) return cached;
  return recountRunsAndLastAt(ctx, id);
}

/** Absolute workspace island path for running commands (used by executor). */
export function workspaceIslandPathForId(ctx: ExperimentStorageContext, id: string): string | null {
  const meta = readMeta(ctx, id);
  if (!meta) return null;
  return workspaceIslandAbs(ctx, meta);
}

export function metaLastModified(ctx: ExperimentStorageContext, id: string): string | null {
  try {
    return statSync(metaPath(ctx, id)).mtime.toISOString();
  } catch {
    return null;
  }
}
