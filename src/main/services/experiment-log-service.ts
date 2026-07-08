/**
 * Experiment log service — split registry (`.prismnext/experiments/`) vs workspace lab.
 *
 * Registry holds meta.json + runs.jsonl per experiment id.
 * Workspace experiment folder is an empty lab — agent-owned layout.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  EXPERIMENT_META_FILENAME,
  EXPERIMENT_REGISTRY_REL,
  EXPERIMENT_RUNS_FILENAME,
  EXPERIMENT_VENV_DIR,
  RUN_OUTPUT_TAIL_BYTES,
  slugBaseFromTitle,
  stripAnsi,
  tailBytes,
  type ExperimentBriefLinks,
  type ExperimentEnv,
  type ExperimentMeta,
  type ExperimentRunEntry,
  type ExperimentRunInput,
  type ExperimentSummary,
} from "../../shared/experiment-log";

const IS_WIN = process.platform === "win32";

/** Resolved paths for one project + Workspace experiment folder. */
export interface ExperimentStorageContext {
  projectRoot: string;
  /** Absolute `.prismnext/experiments` */
  registryRoot: string;
  /** Workspace experiment folder name (e.g. `experiment`) */
  workspaceRel: string;
  /** Absolute workspace experiment folder */
  workspaceAbs: string;
}

export function buildExperimentStorageContext(
  projectRoot: string,
  workspaceRel: string,
): ExperimentStorageContext {
  const root = projectRoot.replace(/\\/g, "/");
  return {
    projectRoot: root,
    registryRoot: join(root, EXPERIMENT_REGISTRY_REL),
    workspaceRel,
    workspaceAbs: join(root, workspaceRel),
  };
}

function registryEntryPath(ctx: ExperimentStorageContext, id: string): string {
  return join(ctx.registryRoot, id);
}

function metaPath(ctx: ExperimentStorageContext, id: string): string {
  return join(registryEntryPath(ctx, id), EXPERIMENT_META_FILENAME);
}

function runsPath(ctx: ExperimentStorageContext, id: string): string {
  return join(registryEntryPath(ctx, id), EXPERIMENT_RUNS_FILENAME);
}

function workspaceIslandAbs(ctx: ExperimentStorageContext, meta: ExperimentMeta): string {
  return join(ctx.projectRoot, meta.workspacePath);
}

function nowUtcIso(): string {
  return new Date().toISOString();
}

function utcDateStamp(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function utcTimeStamp(d = new Date()): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${h}${m}${s}`;
}

function shortHex(len = 4): string {
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

export function generateRunId(): string {
  const d = new Date();
  return `run-${utcDateStamp(d)}-${utcTimeStamp(d)}-${shortHex(4)}`;
}

function readMeta(ctx: ExperimentStorageContext, id: string): ExperimentMeta | null {
  const mp = metaPath(ctx, id);
  if (!existsSync(mp)) return null;
  try {
    return JSON.parse(readFileSync(mp, "utf-8")) as ExperimentMeta;
  } catch {
    return null;
  }
}

function experimentExists(ctx: ExperimentStorageContext, id: string): boolean {
  return readMeta(ctx, id) !== null;
}

// ─── detect_env ──────────────────────────────────────────────────────────

function runShell(cmd: string, cwd: string): string | null {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    });
    return (out || "").trim();
  } catch {
    return null;
  }
}

function whichProbe(binary: string, cwd: string): string | null {
  const cmd = IS_WIN ? `where ${binary} 2>nul` : `command -v ${binary} 2>/dev/null || which ${binary} 2>/dev/null`;
  return runShell(cmd, cwd);
}

/** Detect runtime environment for a workspace island directory. */
export function detectEnv(islandPath: string): ExperimentEnv {
  const venvBin = IS_WIN
    ? join(islandPath, EXPERIMENT_VENV_DIR, "Scripts", "python.exe")
    : join(islandPath, EXPERIMENT_VENV_DIR, "bin", "python");
  const venvExists = existsSync(join(islandPath, EXPERIMENT_VENV_DIR));

  let python: string | null = null;
  let pythonVersion: string | null = null;
  if (venvExists && existsSync(venvBin)) {
    python = venvBin;
    pythonVersion = runShell(`"${venvBin}" --version`, islandPath)?.replace(/^Python\s+/i, "") ?? null;
  }
  if (!python) {
    const pyBin = IS_WIN ? "python" : "python3";
    const resolved = whichProbe(pyBin, islandPath);
    if (resolved) {
      python = resolved;
      pythonVersion = runShell(`"${resolved}" --version`, islandPath)?.replace(/^Python\s+/i, "") ?? null;
    }
  }

  let rscript: string | null = null;
  let rVersion: string | null = null;
  const rResolved = whichProbe("Rscript", islandPath);
  if (rResolved) {
    rscript = rResolved;
    rVersion =
      runShell(`"${rResolved}" --version 2>&1`, islandPath)?.split("\n")[0]?.replace(/^R scripting front-end version\s+/i, "") ?? null;
  }

  const gitCommit = runShell("git rev-parse --short HEAD 2>/dev/null", islandPath);

  return {
    python,
    pythonVersion,
    rscript,
    rVersion,
    platform: process.platform,
    gitCommit,
    venvPath: venvExists ? EXPERIMENT_VENV_DIR : null,
  };
}

// ─── list ──────────────────────────────────────────────────────────────────

function countRunsAndLastAt(ctx: ExperimentStorageContext, id: string): { runCount: number; lastRunAt: string | null } {
  const rp = runsPath(ctx, id);
  if (!existsSync(rp)) return { runCount: 0, lastRunAt: null };
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
  return { runCount, lastRunAt };
}

export function listExperiments(ctx: ExperimentStorageContext): {
  registryRoot: string;
  workspaceRel: string;
  experiments: ExperimentSummary[];
} {
  const experiments: ExperimentSummary[] = [];
  let entries: string[];
  try {
    entries = readdirSync(ctx.registryRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return { registryRoot: EXPERIMENT_REGISTRY_REL, workspaceRel: ctx.workspaceRel, experiments };
  }
  for (const id of entries) {
    const meta = readMeta(ctx, id);
    if (!meta) continue;
    const { runCount, lastRunAt } = countRunsAndLastAt(ctx, id);
    experiments.push({
      id,
      title: meta.title ?? id,
      workspacePath: meta.workspacePath,
      runCount,
      lastRunAt,
    });
  }
  experiments.sort((a, b) => b.id.localeCompare(a.id));
  return { registryRoot: EXPERIMENT_REGISTRY_REL, workspaceRel: ctx.workspaceRel, experiments };
}

// ─── create ─────────────────────────────────────────────────────────────────

export interface CreateExperimentInput {
  title: string;
  briefLinks?: ExperimentBriefLinks;
  tags?: string[];
}

export function createExperiment(
  ctx: ExperimentStorageContext,
  input: CreateExperimentInput,
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

  const meta: ExperimentMeta = {
    id,
    title,
    createdAt: nowUtcIso(),
    workspacePath,
  };
  if (input.briefLinks && Object.keys(input.briefLinks).length > 0) {
    meta.briefLinks = input.briefLinks;
  }
  if (input.tags && input.tags.length > 0) {
    meta.tags = input.tags;
  }

  writeFileSync(metaPath(ctx, id), JSON.stringify(meta, null, 2) + "\n", "utf-8");
  if (!existsSync(runsPath(ctx, id))) {
    writeFileSync(runsPath(ctx, id), "", "utf-8");
  }

  return { ok: true, id, path: workspacePath, meta };
}

// ─── read ───────────────────────────────────────────────────────────────────

export function readExperiment(
  ctx: ExperimentStorageContext,
  id: string,
  runsLimit = 20,
):
  | { ok: true; meta: ExperimentMeta; runs: ExperimentRunEntry[]; workspaceRel: string; registryRoot: string }
  | { ok: false; error: string } {
  if (!experimentExists(ctx, id)) {
    return { ok: false, error: "experiment_not_found" };
  }
  const meta = readMeta(ctx, id)!;
  const runs: ExperimentRunEntry[] = [];
  const rp = runsPath(ctx, id);
  if (existsSync(rp)) {
    try {
      const raw = readFileSync(rp, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);
      const tail = lines.slice(-Math.max(0, runsLimit));
      for (const line of tail) {
        try {
          runs.push(JSON.parse(line) as ExperimentRunEntry);
        } catch {
          // skip malformed line
        }
      }
    } catch {
      // ignore
    }
  }
  return {
    ok: true,
    meta,
    runs,
    workspaceRel: ctx.workspaceRel,
    registryRoot: EXPERIMENT_REGISTRY_REL,
  };
}

// ─── append_run ──────────────────────────────────────────────────────────────

export function appendRun(
  ctx: ExperimentStorageContext,
  id: string,
  input: ExperimentRunInput,
): { ok: true; run: ExperimentRunEntry; path: string } | { ok: false; error: string } {
  const meta = readMeta(ctx, id);
  if (!meta) {
    return { ok: false, error: "experiment_not_found" };
  }
  const command = (input.command ?? "").toString();
  if (!command.trim()) {
    return { ok: false, error: "missing_command" };
  }
  const island = workspaceIslandAbs(ctx, meta);
  const startedAt = input.startedAt ?? nowUtcIso();
  const finishedAt = input.finishedAt ?? nowUtcIso();
  const run: ExperimentRunEntry = {
    runId: input.runId || generateRunId(),
    startedAt,
    finishedAt,
    command,
    cwd: input.cwd ?? meta.workspacePath,
    exitCode: typeof input.exitCode === "number" ? input.exitCode : -1,
    stdoutTail: tailBytes(stripAnsi(input.stdoutTail ?? ""), RUN_OUTPUT_TAIL_BYTES),
    stderrTail: tailBytes(stripAnsi(input.stderrTail ?? ""), RUN_OUTPUT_TAIL_BYTES),
    artifacts: Array.isArray(input.artifacts) ? input.artifacts : [],
    env: input.env ?? detectEnv(island),
  };
  if (input.notes) run.notes = input.notes;
  try {
    appendFileSync(runsPath(ctx, id), JSON.stringify(run) + "\n", "utf-8");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, run, path: join(EXPERIMENT_REGISTRY_REL, id, EXPERIMENT_RUNS_FILENAME) };
}

// ─── helpers for run wrapper ────────────────────────────────────────────────

export function detectEnvForIsland(
  ctx: ExperimentStorageContext,
  id: string,
): { ok: true; env: ExperimentEnv; workspacePath: string } | { ok: false; error: string } {
  const meta = readMeta(ctx, id);
  if (!meta) {
    return { ok: false, error: "experiment_not_found" };
  }
  const island = workspaceIslandAbs(ctx, meta);
  return { ok: true, env: detectEnv(island), workspacePath: meta.workspacePath };
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
