/**
 * Experiment log service — split registry (`.prismnext/experiments/`) vs workspace lab.
 *
 * Registry holds meta.json + runs.jsonl per experiment id.
 * Workspace experiment folder is an empty lab — agent-owned layout.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, relative, resolve as pathResolve } from "node:path";
import { randomBytes } from "node:crypto";
import { appendJsonlLine } from "../lib/jsonl-append";
import { findProjectRelByBasename } from "../lib/find-project-file";
import { normalizeRunArtifactPaths } from "../../shared/artifact-path";
import { resolveExperimentDir } from "./workspace-config";
import { generateProvenanceId, recordRunProvenance } from "./provenance-service";
import {
  EXPERIMENT_META_FILENAME,
  EXPERIMENT_REGISTRY_REL,
  EXPERIMENT_RUNS_FILENAME,
  EXPERIMENT_RUNS_STATS_FILENAME,
  EXPERIMENT_VENV_DIR,
  experimentStatusOf,
  isSafeExperimentId,
  RUN_OUTPUT_TAIL_BYTES,
  isForbiddenSystemPythonInstall,
  isPythonRelatedCommand,
  isExperimentPythonSetupCommand,
  isExperimentPythonScriptCommand,
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

/** Hint surfaced to UI / agent when the project has no Workspace Experiment folder configured. */
export const NO_EXPERIMENT_FOLDER_HINT =
  "Add an Experiment folder in Settings → Workspace (function: Experiment) before creating or running experiments.";

/**
 * Resolve the experiment storage context for a project, or surface a
 * `no_experiment_folder` error. Shared by the file-bridge and the UI IPC
 * (Sprint 0.7 D5) so the error shape stays identical.
 */
export function resolveExperimentCtx(
  projectRoot: string,
): ExperimentStorageContext | { ok: false; error: "no_experiment_folder"; hint: string } {
  const prismDir = join(projectRoot, ".prismnext");
  const resolved = resolveExperimentDir(projectRoot, prismDir);
  if ("error" in resolved) {
    return { ok: false, error: "no_experiment_folder", hint: NO_EXPERIMENT_FOLDER_HINT };
  }
  return buildExperimentStorageContext(projectRoot, resolved.rel);
}

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

function runsStatsPath(ctx: ExperimentStorageContext, id: string): string {
  return join(registryEntryPath(ctx, id), EXPERIMENT_RUNS_STATS_FILENAME);
}

interface RunsStats {
  runCount: number;
  lastRunAt: string | null;
}

function writeRunsStats(ctx: ExperimentStorageContext, id: string, stats: RunsStats): void {
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
function bumpRunsStats(
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

type MetaReadResult =
  | { ok: true; meta: ExperimentMeta }
  | { ok: false; reason: "invalid_id" | "missing" | "corrupt" };

function readMetaResult(ctx: ExperimentStorageContext, id: string): MetaReadResult {
  if (!isSafeExperimentId(id)) return { ok: false, reason: "invalid_id" };
  const mp = metaPath(ctx, id);
  if (!existsSync(mp)) return { ok: false, reason: "missing" };
  try {
    return { ok: true, meta: JSON.parse(readFileSync(mp, "utf-8")) as ExperimentMeta };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

function readMeta(ctx: ExperimentStorageContext, id: string): ExperimentMeta | null {
  const r = readMetaResult(ctx, id);
  return r.ok ? r.meta : null;
}

function writeMeta(ctx: ExperimentStorageContext, meta: ExperimentMeta): void {
  writeFileSync(metaPath(ctx, meta.id), JSON.stringify(meta, null, 2) + "\n", "utf-8");
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

/**
 * Absolute path to the shared Experiment-workspace venv Python interpreter
 * (`<workspaceAbs>/.venv/bin/python` — may not exist yet).
 */
export function resolveWorkspaceExperimentVenvPython(workspaceAbs: string): string {
  return IS_WIN
    ? join(workspaceAbs, EXPERIMENT_VENV_DIR, "Scripts", "python.exe")
    : join(workspaceAbs, EXPERIMENT_VENV_DIR, "bin", "python");
}

/** @deprecated Use `resolveWorkspaceExperimentVenvPython` (shared workspace venv). */
export function resolveIslandVenvPython(workspaceAbs: string): string {
  return resolveWorkspaceExperimentVenvPython(workspaceAbs);
}

/** Injectable shell runner for `ensureExperimentPythonVenv` (tests + production). */
export type ExperimentVenvRunner = (
  cmd: string,
  cwd: string,
) => { ok: boolean; stderr?: string };

export interface EnsureExperimentPythonVenvResult {
  ok: boolean;
  /** True when this call created the venv (false if it already existed). */
  created: boolean;
  /** Project-relative venv path when `workspaceRel` is known, else `.venv`. */
  venvPath: string | null;
  python: string | null;
  method?: "uv" | "venv" | "existing";
  error?: string;
}

function defaultVenvRunner(cmd: string, cwd: string): { ok: boolean; stderr?: string } {
  try {
    execSync(cmd, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });
    return { ok: true };
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : e.stderr?.toString?.() ?? e.message ?? String(err);
    return { ok: false, stderr: stderr.trim() || "command failed" };
  }
}

function workspaceVenvRel(workspaceRel?: string): string {
  const rel = (workspaceRel || "").replace(/\\/g, "/").replace(/\/$/, "");
  return rel ? `${rel}/${EXPERIMENT_VENV_DIR}` : EXPERIMENT_VENV_DIR;
}

/**
 * Ensure one shared `<Experiment workspace>/.venv` for all islands.
 * Prefer `uv venv`, fall back to `python3 -m venv`. Idempotent when the
 * interpreter already exists. Never installs packages into system Python.
 */
export function ensureExperimentPythonVenv(
  workspaceAbs: string,
  opts?: { runner?: ExperimentVenvRunner; workspaceRel?: string },
): EnsureExperimentPythonVenvResult {
  const runner = opts?.runner ?? defaultVenvRunner;
  const venvRel = workspaceVenvRel(opts?.workspaceRel);
  const python = resolveWorkspaceExperimentVenvPython(workspaceAbs);

  if (existsSync(python)) {
    return {
      ok: true,
      created: false,
      venvPath: venvRel,
      python,
      method: "existing",
    };
  }

  mkdirSync(workspaceAbs, { recursive: true });

  const uvCmd = `uv venv ${EXPERIMENT_VENV_DIR}`;
  const uvResult = runner(uvCmd, workspaceAbs);
  if (uvResult.ok && existsSync(python)) {
    return {
      ok: true,
      created: true,
      venvPath: venvRel,
      python,
      method: "uv",
    };
  }

  const pyBin = IS_WIN ? "python" : "python3";
  const venvCmd = `${pyBin} -m venv ${EXPERIMENT_VENV_DIR}`;
  const venvResult = runner(venvCmd, workspaceAbs);
  if (venvResult.ok && existsSync(python)) {
    return {
      ok: true,
      created: true,
      venvPath: venvRel,
      python,
      method: "venv",
    };
  }

  const detail = [
    `uv: ${uvResult.stderr ?? "fail"}`,
    `venv: ${venvResult.stderr ?? "fail"}`,
  ].join("; ");
  return {
    ok: false,
    created: false,
    venvPath: existsSync(join(workspaceAbs, EXPERIMENT_VENV_DIR)) ? venvRel : null,
    python: null,
    error: `failed to create shared Experiment workspace venv (${detail})`,
  };
}

/** Walk up from a path looking for a `.prismnext` directory (project root). */
export function findPrismProjectRoot(start: string): string | null {
  let cur = pathResolve(start || "");
  for (let i = 0; i < 48; i++) {
    if (existsSync(join(cur, ".prismnext"))) return cur.replace(/\\/g, "/");
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function normalizeAbs(p: string): string {
  return pathResolve(p).replace(/\\/g, "/");
}

function isPathInside(parentAbs: string, childAbs: string): boolean {
  const parent = normalizeAbs(parentAbs).replace(/\/$/, "");
  const child = normalizeAbs(childAbs);
  return child === parent || child.startsWith(parent + "/");
}

/**
 * Extract `cd` targets from a compound shell command (best-effort).
 * Supports quoted paths; ignores `cd -` / `$VAR` / `~` (Bugs #17 / #31) —
 * we do not emulate shell directory stacks or expand env.
 */
export function extractCdTargets(command: string): string[] {
  const out: string[] = [];
  const re = /\bcd\s+(?:'([^']*)'|"([^"]*)"|([^\s;&|$~]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!raw) continue;
    if (raw === "-" || raw === "--") continue;
    if (raw.includes("$") || raw.startsWith("~")) continue;
    out.push(raw);
  }
  return out;
}

/**
 * Resolve the experiment island root for a path under the Workspace Experiment folder.
 * Returns null when the path is not under that folder; `{ island: null }` when it is
 * under the folder but not inside a concrete island (e.g. folder root).
 */
export function resolveExperimentIslandForPath(
  projectRoot: string,
  experimentWorkspaceRel: string,
  candidateAbs: string,
): { underExperiment: false } | { underExperiment: true; islandAbs: string | null; islandId: string | null } {
  const expAbs = normalizeAbs(join(projectRoot, experimentWorkspaceRel));
  const candidate = normalizeAbs(candidateAbs);
  if (!isPathInside(expAbs, candidate)) {
    return { underExperiment: false };
  }
  const rel = candidate.slice(expAbs.length).replace(/^\//, "");
  if (!rel) {
    return { underExperiment: true, islandAbs: null, islandId: null };
  }
  const islandId = rel.split("/")[0] || null;
  if (!islandId || islandId === "." || islandId === "..") {
    return { underExperiment: true, islandAbs: null, islandId: null };
  }
  return {
    underExperiment: true,
    islandAbs: join(expAbs, islandId),
    islandId,
  };
}

export type ExperimentPythonGate =
  | { action: "passthrough" }
  | { action: "apply"; islandAbs: string; envExtra: Record<string, string>; python: string }
  | { action: "block"; error: string };

function buildWorkspaceVenvEnvExtra(pythonAbs: string): Record<string, string> {
  const venvBin = dirname(pythonAbs);
  const venvRoot = pathResolve(venvBin, "..");
  const delim = IS_WIN ? ";" : ":";
  const currentPath = process.env.PATH ?? "";
  return {
    PYTHONUNBUFFERED: "1",
    PATH: currentPath ? `${venvBin}${delim}${currentPath}` : venvBin,
    VIRTUAL_ENV: venvRoot,
  };
}

/**
 * Hard gate for Python under the Workspace Experiment function folder
 * (whatever name the user configured — not only `experiment/`).
 *
 * Shared venv: `<experiment-dir>/.venv` (all islands reuse it).
 *
 * - Non-Python → passthrough
 * - Python outside that folder → passthrough
 * - Scripts inside folder but not in an island → block (use experiment-run in an island)
 * - Env setup (`uv pip` / `uv venv`) at workspace root or island → apply shared venv
 * - Scripts in an island → ensure shared venv + inject PATH / VIRTUAL_ENV
 * - `--system` / bare pip installs → block
 */
export function gateExperimentPythonExecution(opts: {
  projectRoot?: string | null;
  cwd: string;
  command: string;
  ensureOpts?: { runner?: ExperimentVenvRunner };
  /**
   * When true (bash tool only): refuse Python *script* runs inside Experiment
   * islands — agent must use experiment-run. Setup (`uv pip` / `venv`) still allowed.
   */
  blockBashPythonScripts?: boolean;
}): ExperimentPythonGate {
  const command = opts.command || "";

  // Always refuse bare pip/pip3/python -m pip install — hits system Python from project root.
  if (isForbiddenSystemPythonInstall(command)) {
    return {
      action: "block",
      error:
        `Prism Next: refuse \`pip\` / \`pip3\` / \`python -m pip\` install via bash — that installs into **system Python**. ` +
        `From the Experiment workspace (or any island), run \`uv pip install <pkg>\` so packages land in the shared \`<experiment-dir>/.venv\` only.`,
    };
  }

  if (!isPythonRelatedCommand(command)) {
    return { action: "passthrough" };
  }

  const projectRoot =
    (opts.projectRoot && opts.projectRoot.trim()) ||
    findPrismProjectRoot(opts.cwd) ||
    findPrismProjectRoot(process.cwd());
  if (!projectRoot) {
    return { action: "passthrough" };
  }

  const resolved = resolveExperimentDir(projectRoot, join(projectRoot, ".prismnext"));
  if ("error" in resolved) {
    return { action: "passthrough" };
  }

  const workspaceAbs = normalizeAbs(join(projectRoot, resolved.rel));
  const candidates: string[] = [opts.cwd];
  for (const cd of extractCdTargets(command)) {
    candidates.push(pathResolve(opts.cwd, cd));
  }

  let islandAbs: string | null = null;
  let sawUnderExperiment = false;
  for (const candidate of candidates) {
    const hit = resolveExperimentIslandForPath(projectRoot, resolved.rel, candidate);
    if (!hit.underExperiment) continue;
    sawUnderExperiment = true;
    if (hit.islandAbs) {
      islandAbs = hit.islandAbs;
      break;
    }
  }

  if (!sawUnderExperiment) {
    return { action: "passthrough" };
  }

  const isSetup = isExperimentPythonSetupCommand(command);

  // Scripts need an island (logged via experiment-run). Setup may run at workspace root.
  if (!islandAbs && !isSetup) {
    return {
      action: "block",
      error:
        `Prism Next: Python scripts under the Experiment workspace (\`${resolved.rel}/\`) must run inside an experiment island ` +
        `(\`${resolved.rel}/<id>/\`) via \`experiment-run\`. Env setup (\`uv pip install\`) may run from \`${resolved.rel}/\` ` +
        `and installs into the shared \`${resolved.rel}/${EXPERIMENT_VENV_DIR}\`.`,
    };
  }

  if (opts.blockBashPythonScripts && isExperimentPythonScriptCommand(command)) {
    return {
      action: "block",
      error:
        `Prism Next: do not run Python scripts via bash inside the Experiment workspace. ` +
        `Use the \`experiment-run\` tool (id + command, pass image paths in \`artifacts\`) so the run is logged and figures appear in chat. ` +
        `Bash is only allowed for env setup (\`uv pip install\`, \`uv venv\` into \`${resolved.rel}/${EXPERIMENT_VENV_DIR}\`).`,
    };
  }

  if (isForbiddenSystemPythonInstall(command)) {
    return {
      action: "block",
      error:
        `Prism Next: refuse system Python installs. Use \`uv pip install <pkg>\` from the Experiment workspace ` +
        `so packages land in the shared \`${resolved.rel}/${EXPERIMENT_VENV_DIR}\` — never \`pip3\` / \`pip\` / \`python -m pip\`.`,
    };
  }

  const ensured = ensureExperimentPythonVenv(workspaceAbs, {
    ...opts.ensureOpts,
    workspaceRel: resolved.rel,
  });
  if (!ensured.ok || !ensured.python) {
    return {
      action: "block",
      error:
        `Prism Next: Python under Experiment requires the shared \`${resolved.rel}/${EXPERIMENT_VENV_DIR}\`. ` +
        `Could not create it: ${ensured.error ?? "unknown error"}. Install uv or python3, then retry.`,
    };
  }

  return {
    action: "apply",
    islandAbs: islandAbs ?? workspaceAbs,
    python: ensured.python,
    envExtra: buildWorkspaceVenvEnvExtra(ensured.python),
  };
}

/** Detect runtime environment; Python prefers the shared Experiment workspace venv. */
export function detectEnv(
  probeCwd: string,
  workspace?: { workspaceAbs: string; workspaceRel: string },
): ExperimentEnv {
  const workspaceAbs = workspace?.workspaceAbs ?? probeCwd;
  const workspaceRel = workspace?.workspaceRel;
  const venvBin = resolveWorkspaceExperimentVenvPython(workspaceAbs);
  const venvExists = existsSync(join(workspaceAbs, EXPERIMENT_VENV_DIR));
  const venvRel = workspaceVenvRel(workspaceRel);

  let python: string | null = null;
  let pythonVersion: string | null = null;
  if (venvExists && existsSync(venvBin)) {
    python = venvBin;
    pythonVersion = runShell(`"${venvBin}" --version`, probeCwd)?.replace(/^Python\s+/i, "") ?? null;
  }
  if (!python) {
    const pyBin = IS_WIN ? "python" : "python3";
    const resolvedPy = whichProbe(pyBin, probeCwd);
    if (resolvedPy) {
      python = resolvedPy;
      pythonVersion = runShell(`"${resolvedPy}" --version`, probeCwd)?.replace(/^Python\s+/i, "") ?? null;
    }
  }

  let rscript: string | null = null;
  let rVersion: string | null = null;
  const rResolved = whichProbe("Rscript", probeCwd);
  if (rResolved) {
    rscript = rResolved;
    rVersion =
      runShell(`"${rResolved}" --version 2>&1`, probeCwd)?.split("\n")[0]?.replace(/^R scripting front-end version\s+/i, "") ?? null;
  }

  const gitCommit = runShell("git rev-parse --short HEAD 2>/dev/null", probeCwd);

  return {
    python,
    pythonVersion,
    rscript,
    rVersion,
    platform: process.platform,
    gitCommit,
    venvPath: venvExists && existsSync(venvBin) ? venvRel : null,
  };
}

// ─── list ──────────────────────────────────────────────────────────────────

function countRunsAndLastAt(ctx: ExperimentStorageContext, id: string): RunsStats {
  const cached = readRunsStatsFile(ctx, id);
  if (cached) return cached;
  return recountRunsAndLastAt(ctx, id);
}

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
}

export interface CreateExperimentOptions {
  /** Default true — best-effort shared `uv venv` / `python -m venv` under the Experiment workspace. */
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
    // Best-effort shared workspace venv — create still succeeds if no Python runtime.
    ensureExperimentPythonVenv(ctx.workspaceAbs, {
      runner: opts?.venvRunner,
      workspaceRel: ctx.workspaceRel,
    });
  }

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
  writeRunsStats(ctx, id, { runCount: 0, lastRunAt: null });

  return { ok: true, id, path: workspacePath, meta };
}

// ─── read ───────────────────────────────────────────────────────────────────

export function readExperiment(
  ctx: ExperimentStorageContext,
  id: string,
  runsLimit = 20,
):
  | {
      ok: true;
      meta: ExperimentMeta;
      runs: ExperimentRunEntry[];
      /** Total runs in jsonl (not limited by `runsLimit`). */
      runCount: number;
      lastRunAt: string | null;
      workspaceRel: string;
      registryRoot: string;
    }
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
  const { runCount, lastRunAt } = countRunsAndLastAt(ctx, id);
  return {
    ok: true,
    meta,
    runs,
    runCount,
    lastRunAt,
    workspaceRel: ctx.workspaceRel,
    registryRoot: EXPERIMENT_REGISTRY_REL,
  };
}

// ─── append_run ──────────────────────────────────────────────────────────────

export function appendRun(
  ctx: ExperimentStorageContext,
  id: string,
  input: ExperimentRunInput,
  context?: { chatSessionId?: string | null },
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
  const workspacePath = meta.workspacePath;
  const artifacts = normalizeRunArtifactPaths(
    Array.isArray(input.artifacts) ? input.artifacts : [],
    {
      workspacePath,
      existsProjectRel: (rel) => existsSync(join(ctx.projectRoot, rel)),
      findByBasename: (base) => findProjectRelByBasename(ctx.projectRoot, base),
    },
  );
  const run: ExperimentRunEntry = {
    runId: input.runId || generateRunId(),
    startedAt,
    finishedAt,
    command,
    cwd: input.cwd ?? workspacePath,
    exitCode: typeof input.exitCode === "number" ? input.exitCode : -1,
    stdoutTail: tailBytes(stripAnsi(input.stdoutTail ?? ""), RUN_OUTPUT_TAIL_BYTES),
    stderrTail: tailBytes(stripAnsi(input.stderrTail ?? ""), RUN_OUTPUT_TAIL_BYTES),
    artifacts,
    env:
      input.env ??
      detectEnv(island, {
        workspaceAbs: ctx.workspaceAbs,
        workspaceRel: ctx.workspaceRel,
      }),
  };
  if (input.notes) run.notes = input.notes;
  if (input.cancelled) run.cancelled = true;
  if (input.kind) run.kind = input.kind;
  if (input.logPath) run.logPath = input.logPath;
  // Provenance before runs.jsonl (Bug #5): never stamp an orphan provenanceEventId
  // on the run when the mirror fails. Prefer a provenance row without a run link
  // over a run pointing at a missing event.
  const chatSessionId = context?.chatSessionId ?? null;
  run.chatSessionId = chatSessionId;
  const provenanceEventId = generateProvenanceId();
  const mirroredId = recordRunProvenance(ctx.projectRoot, {
    workspaceRel: ctx.workspaceRel,
    experimentId: id,
    run,
    chatSessionId,
    provenanceEventId,
    islandAbs: island,
  });
  if (mirroredId) {
    run.provenanceEventId = mirroredId;
  }
  try {
    appendJsonlLine(runsPath(ctx, id), run);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  bumpRunsStats(ctx, id, run);
  return { ok: true, run, path: join(EXPERIMENT_REGISTRY_REL, id, EXPERIMENT_RUNS_FILENAME) };
}

// ─── helpers for run wrapper ────────────────────────────────────────────────

export function detectEnvForIsland(
  ctx: ExperimentStorageContext,
  id: string,
  opts?: { ensureVenv?: boolean; venvRunner?: ExperimentVenvRunner },
): { ok: true; env: ExperimentEnv; workspacePath: string } | { ok: false; error: string } {
  const meta = readMeta(ctx, id);
  if (!meta) {
    return { ok: false, error: "experiment_not_found" };
  }
  const island = workspaceIslandAbs(ctx, meta);
  if (opts?.ensureVenv !== false) {
    ensureExperimentPythonVenv(ctx.workspaceAbs, {
      runner: opts?.venvRunner,
      workspaceRel: ctx.workspaceRel,
    });
  }
  return {
    ok: true,
    env: detectEnv(island, {
      workspaceAbs: ctx.workspaceAbs,
      workspaceRel: ctx.workspaceRel,
    }),
    workspacePath: meta.workspacePath,
  };
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
