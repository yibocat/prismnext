/**
 * Experiment registry CRUD — list / create / read / update / archive / delete.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve as pathResolve } from "node:path";
import { resolveResearchBriefSection } from "../../shared/research/brief";
import {
  EXPERIMENT_REGISTRY_REL,
  experimentStatusOf,
  isSafeExperimentId,
  type ExperimentBriefLinks,
  type ExperimentMeta,
  type ExperimentRunEntry,
  type ExperimentSummary,
} from "../../shared/experiments/log";
import type { ExperimentStorageContext } from "./context";
import {
  countRunsAndLastAt,
  generateExperimentSlug,
  experimentExists,
  metaPath,
  nowUtcIso,
  readMeta,
  readMetaResult,
  registryEntryPath,
  runsPath,
  workspaceIslandAbs,
  writeMeta,
  writeRunsStats,
} from "./registry";
import { ensureExperimentPythonVenv, type ExperimentVenvRunner } from "./venv";

export interface ListExperimentsOptions {
  /**
   * When false, hide `status: archived` (human browse default).
   * When true / omitted, include archived (Agent `list` default per Q1=A).
   */
  includeArchived?: boolean;
}

export function listExperiments(
  ctx: ExperimentStorageContext,
  opts?: ListExperimentsOptions,
): {
  registryRoot: string;
  workspaceRel: string;
  experiments: ExperimentSummary[];
  /** Registry dirs whose meta.json is missing or unparseable (Bug #19). */
  corruptIds: string[];
} {
  const includeArchived = opts?.includeArchived !== false;
  const experiments: ExperimentSummary[] = [];
  const corruptIds: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(ctx.registryRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return {
      registryRoot: EXPERIMENT_REGISTRY_REL,
      workspaceRel: ctx.workspaceRel,
      experiments,
      corruptIds,
    };
  }
  for (const id of entries) {
    const metaRead = readMetaResult(ctx, id);
    if (!metaRead.ok) {
      if (metaRead.reason === "corrupt" || metaRead.reason === "missing") {
        corruptIds.push(id);
      }
      continue;
    }
    const meta = metaRead.meta;
    const status = experimentStatusOf(meta);
    if (!includeArchived && status === "archived") continue;
    const { runCount, lastRunAt } = countRunsAndLastAt(ctx, id);
    experiments.push({
      id,
      title: meta.title ?? id,
      workspacePath: meta.workspacePath,
      runCount,
      lastRunAt,
      status,
      archivedAt: meta.archivedAt ?? null,
      tags: meta.tags,
    });
  }
  experiments.sort((a, b) => b.id.localeCompare(a.id));
  corruptIds.sort((a, b) => a.localeCompare(b));
  return {
    registryRoot: EXPERIMENT_REGISTRY_REL,
    workspaceRel: ctx.workspaceRel,
    experiments,
    corruptIds,
  };
}

// ─── archive / restore / delete (Phase 4 / P2.1) ─────────────────────────────

export function archiveExperiment(
  ctx: ExperimentStorageContext,
  id: string,
): { ok: true; meta: ExperimentMeta } | { ok: false; error: string } {
  if (!isSafeExperimentId(id)) return { ok: false, error: "invalid_id" };
  const meta = readMeta(ctx, id);
  if (!meta) return { ok: false, error: "experiment_not_found" };
  if (experimentStatusOf(meta) === "archived") {
    return { ok: true, meta };
  }
  const next: ExperimentMeta = {
    ...meta,
    status: "archived",
    archivedAt: nowUtcIso(),
  };
  try {
    writeMeta(ctx, next);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, meta: next };
}

export function restoreExperiment(
  ctx: ExperimentStorageContext,
  id: string,
): { ok: true; meta: ExperimentMeta } | { ok: false; error: string } {
  if (!isSafeExperimentId(id)) return { ok: false, error: "invalid_id" };
  const meta = readMeta(ctx, id);
  if (!meta) return { ok: false, error: "experiment_not_found" };
  const next: ExperimentMeta = {
    ...meta,
    status: "active",
    archivedAt: null,
  };
  try {
    writeMeta(ctx, next);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, meta: next };
}

export interface UpdateExperimentInput {
  title?: string;
  tags?: string[];
  description?: string;
  /** Pass `null` to clear all brief links. */
  briefLinks?: ExperimentBriefLinks | null;
}

function normalizeBriefLinks(
  input: ExperimentBriefLinks | null | undefined,
): ExperimentBriefLinks | undefined {
  if (input === null) return undefined;
  if (input === undefined) return undefined;
  const seen = new Set<string>();
  const sections: string[] = [];
  if (Array.isArray(input.sections)) {
    for (const raw of input.sections) {
      const resolved = resolveResearchBriefSection(raw);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      sections.push(resolved);
    }
  }
  const hypothesisExcerpt = input.hypothesisExcerpt?.trim() || undefined;
  const researchQuestionExcerpt = input.researchQuestionExcerpt?.trim() || undefined;
  if (!hypothesisExcerpt && !researchQuestionExcerpt && sections.length === 0) {
    return undefined;
  }
  const out: ExperimentBriefLinks = {};
  if (hypothesisExcerpt) out.hypothesisExcerpt = hypothesisExcerpt;
  if (researchQuestionExcerpt) out.researchQuestionExcerpt = researchQuestionExcerpt;
  if (sections.length > 0) out.sections = sections;
  return out;
}

export function updateExperiment(
  ctx: ExperimentStorageContext,
  id: string,
  input: UpdateExperimentInput,
): { ok: true; meta: ExperimentMeta } | { ok: false; error: string } {
  if (!isSafeExperimentId(id)) return { ok: false, error: "invalid_id" };
  const meta = readMeta(ctx, id);
  if (!meta) return { ok: false, error: "experiment_not_found" };

  const next: ExperimentMeta = {
    ...meta,
  };
  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (!trimmed) return { ok: false, error: "missing_title" };
    next.title = trimmed;
  }
  if (input.tags !== undefined) {
    next.tags = input.tags.map((t) => t.trim()).filter(Boolean);
  }
  if (input.description !== undefined) {
    next.description = input.description.trim() || undefined;
  }
  if (input.briefLinks !== undefined) {
    const normalized = normalizeBriefLinks(input.briefLinks);
    if (normalized) next.briefLinks = normalized;
    else delete next.briefLinks;
  }

  try {
    writeMeta(ctx, next);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, meta: next };
}

export interface DeleteExperimentOptions {
  /** When true, also rm the lab island under the Experiment workspace. */
  removeLab?: boolean;
}

export function deleteExperiment(
  ctx: ExperimentStorageContext,
  id: string,
  opts?: DeleteExperimentOptions,
): { ok: true } | { ok: false; error: string } {
  if (!isSafeExperimentId(id)) return { ok: false, error: "invalid_id" };
  const meta = readMeta(ctx, id);
  if (!meta) return { ok: false, error: "experiment_not_found" };

  if (opts?.removeLab) {
    const island = workspaceIslandAbs(ctx, meta);
    const workspaceResolved = pathResolve(ctx.workspaceAbs);
    const islandResolved = pathResolve(island);
    const rel = relative(workspaceResolved, islandResolved).replace(/\\/g, "/");
    if (rel !== id || rel.startsWith("..")) {
      return { ok: false, error: "unsafe_lab_path" };
    }
    try {
      if (existsSync(islandResolved)) {
        rmSync(islandResolved, { recursive: true, force: true });
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  const registryDir = registryEntryPath(ctx, id);
  try {
    rmSync(registryDir, { recursive: true, force: true });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true };
}

// ─── create ─────────────────────────────────────────────────────────────────

export interface CreateExperimentInput {
  title: string;
  briefLinks?: ExperimentBriefLinks;
  tags?: string[];
  description?: string;
}

export interface CreateExperimentOptions {
  /** Default true — best-effort shared `uv venv` / `python -m venv` at `.workbench/.venv`. */
  ensureVenv?: boolean;
  venvRunner?: ExperimentVenvRunner;
}

export function createExperiment(
  ctx: ExperimentStorageContext,
  input: CreateExperimentInput,
  opts?: CreateExperimentOptions,
): { ok: true; id: string; path: string; meta: ExperimentMeta } | { ok: false; error: string } {
  const title = (input.title || "").trim();
  if (!title) {
    return { ok: false, error: "missing_title" };
  }

  mkdirSync(ctx.registryRoot, { recursive: true });

  const id = generateExperimentSlug(ctx.registryRoot, title);
  const workspacePath = `${ctx.workspaceRel}/${id}`;
  const registryDir = registryEntryPath(ctx, id);
  const workspaceIsland = join(ctx.projectRoot, workspacePath);

  mkdirSync(registryDir, { recursive: true });
  mkdirSync(workspaceIsland, { recursive: true });

  if (opts?.ensureVenv !== false) {
    // Best-effort shared project venv — create still succeeds if no Python runtime.
    ensureExperimentPythonVenv(ctx.projectRoot, {
      runner: opts?.venvRunner,
    });
  }

  const meta: ExperimentMeta = {
    id,
    title,
    createdAt: nowUtcIso(),
    workspacePath,
  };
  if (input.briefLinks && Object.keys(input.briefLinks).length > 0) {
    const normalized = normalizeBriefLinks(input.briefLinks);
    if (normalized) meta.briefLinks = normalized;
  }
  if (input.tags && input.tags.length > 0) {
    meta.tags = input.tags;
  }
  if (input.description && input.description.trim()) {
    meta.description = input.description.trim();
  }

  writeFileSync(metaPath(ctx, id), JSON.stringify(meta, null, 2) + "\n", "utf-8");
  if (!existsSync(runsPath(ctx, id))) {
    writeFileSync(runsPath(ctx, id), "", "utf-8");
  }
  writeRunsStats(ctx, id, { runCount: 0, lastRunAt: null });

  return { ok: true, id, path: workspacePath, meta };
}

// ─── read ───────────────────────────────────────────────────────────────────

export type ReadExperimentOptions = {
  /**
   * When false (agent default), strip `stdoutTail` / `stderrTail` so a modest
   * `runsLimit` cannot blow the tool-output budget. UI / IPC keep full tails.
   */
  includeOutput?: boolean;
};

/** Agent fat reads (stdout/stderr) — keep tiny so tool output is not truncated. */
export const MAX_AGENT_RUNS_WITH_OUTPUT = 10;
/** Lean agent history window — identity / artifacts / command only. */
export const MAX_AGENT_RUNS_LEAN = 50;

function stripRunOutput(run: ExperimentRunEntry): ExperimentRunEntry {
  if (!run.stdoutTail && !run.stderrTail) return run;
  return { ...run, stdoutTail: "", stderrTail: "" };
}

function parseRunLine(line: string): ExperimentRunEntry | null {
  try {
    return JSON.parse(line) as ExperimentRunEntry;
  } catch {
    return null;
  }
}

export function readExperiment(
  ctx: ExperimentStorageContext,
  id: string,
  runsLimit = 20,
  options?: ReadExperimentOptions,
):
  | {
      ok: true;
      meta: ExperimentMeta;
      runs: ExperimentRunEntry[];
      /** Total runs in jsonl (not limited by `runsLimit`). */
      runCount: number;
      lastRunAt: string | null;
      /**
       * Absolute first / last lines in `runs.jsonl` (lean). Prefer these for
       * “第一次 / 最新一次” — do not infer from `runs[0]` when the window is a tail.
       */
      oldestRun: ExperimentRunEntry | null;
      latestRun: ExperimentRunEntry | null;
      /** Always chronological within the returned window: oldest → newest. */
      runsOrder: "chronological_oldest_first";
      includeOutput: boolean;
      workspaceRel: string;
      registryRoot: string;
    }
  | { ok: false; error: string } {
  if (!experimentExists(ctx, id)) {
    return { ok: false, error: "experiment_not_found" };
  }
  const includeOutput = options?.includeOutput !== false;
  // Cap only lean agent-style windows here; UI passes includeOutput:true with its own limit.
  // Agent bridge additionally caps fat reads via MAX_AGENT_RUNS_WITH_OUTPUT.
  const cappedLimit = includeOutput
    ? Math.max(0, runsLimit)
    : Math.min(Math.max(0, runsLimit), MAX_AGENT_RUNS_LEAN);
  const meta = readMeta(ctx, id)!;
  const runs: ExperimentRunEntry[] = [];
  let oldestRun: ExperimentRunEntry | null = null;
  let latestRun: ExperimentRunEntry | null = null;
  const rp = runsPath(ctx, id);
  if (existsSync(rp)) {
    try {
      const raw = readFileSync(rp, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        oldestRun = parseRunLine(lines[0]!);
        latestRun = parseRunLine(lines[lines.length - 1]!);
      }
      const tail = lines.slice(-cappedLimit);
      for (const line of tail) {
        const entry = parseRunLine(line);
        if (entry) runs.push(entry);
      }
    } catch {
      // ignore
    }
  }
  if (!includeOutput) {
    for (let i = 0; i < runs.length; i++) {
      runs[i] = stripRunOutput(runs[i]!);
    }
    if (oldestRun) oldestRun = stripRunOutput(oldestRun);
    if (latestRun) latestRun = stripRunOutput(latestRun);
  }
  const { runCount, lastRunAt } = countRunsAndLastAt(ctx, id);
  return {
    ok: true,
    meta,
    runs,
    runCount,
    lastRunAt,
    oldestRun,
    latestRun,
    runsOrder: "chronological_oldest_first",
    includeOutput,
    workspaceRel: ctx.workspaceRel,
    registryRoot: EXPERIMENT_REGISTRY_REL,
  };
}
