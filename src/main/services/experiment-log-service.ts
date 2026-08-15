/**
 * Experiment log service — split registry (`.prismnext/experiments/`) vs workspace lab.
 *
 * Registry holds meta.json + runs.jsonl per experiment id.
 * Workspace experiment folder is an empty lab — agent-owned layout.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, relative, resolve as pathResolve } from "node:path";
import { randomBytes } from "node:crypto";
import { appendJsonlLine } from "../lib/jsonl-append";
import { findProjectRelByBasename } from "../lib/find-project-file";
import {
  artifactBasename,
  isImageArtifactPath,
  normalizeArtifactSlash,
  normalizeRunArtifactPaths,
} from "../../shared/artifact-path";
import { resolveExperimentDir } from "./workspace-config";
import { generateProvenanceId, recordRunProvenance } from "./provenance-service";
import {
  EXPERIMENT_META_FILENAME,
  EXPERIMENT_REGISTRY_REL,
  EXPERIMENT_RUNS_FILENAME,
  EXPERIMENT_RUNS_STATS_FILENAME,
  EXPERIMENT_VENV_DIR,
  PRISMNEXT_VENV_REL,
  experimentStatusOf,
  isSafeExperimentId,
  RUN_OUTPUT_TAIL_BYTES,
  isForbiddenSystemPythonInstall,
  isPythonRelatedCommand,
  extractAbsolutePythonPath,
  isExternalInterpreterCommand,
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
import { resolveResearchBriefSection } from "../../shared/research-brief";

/** Hint surfaced to UI / agent when the project has no Workspace Experiment folder configured. */
export const NO_EXPERIMENT_FOLDER_HINT =
  "Add an Experiment folder in Settings → Workspace (function: Experiment) before creating or running experiments.";

/**
 * Resolve the experiment storage context for a project, or surface a
 * `no_experiment_folder` error. Shared by the file-bridge and the UI IPC
 * (Sprint 0.7 D5) so the error shape stays identical.
 */
export type ExperimentCtxError = {
  ok: false;
  error: "no_experiment_folder";
  hint: string;
};

export type ExperimentCtxResult = ExperimentStorageContext | ExperimentCtxError;

export function isExperimentCtxError(
  result: ExperimentCtxResult,
): result is ExperimentCtxError {
  return "ok" in result && result.ok === false;
}

export function resolveExperimentCtx(projectRoot: string): ExperimentCtxResult {
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
 * Absolute paths for the project-scoped shared Python venv
 * (`.prismnext/.venv` — may not exist yet).
 */
export function resolveProjectPythonVenv(projectRoot: string): {
  venvAbs: string;
  venvRel: string;
  python: string;
} {
  const root = pathResolve(projectRoot);
  const venvAbs = join(root, ".prismnext", EXPERIMENT_VENV_DIR);
  const python = IS_WIN
    ? join(venvAbs, "Scripts", "python.exe")
    : join(venvAbs, "bin", "python");
  return { venvAbs, venvRel: PRISMNEXT_VENV_REL, python };
}

/**
 * Absolute path to the shared project venv Python interpreter.
 * `projectRoot` is the Prism project root (directory that contains `.prismnext/`).
 */
export function resolveWorkspaceExperimentVenvPython(projectRoot: string): string {
  return resolveProjectPythonVenv(projectRoot).python;
}

/** @deprecated Use `resolveWorkspaceExperimentVenvPython` / `resolveProjectPythonVenv`. */
export function resolveIslandVenvPython(projectRoot: string): string {
  return resolveWorkspaceExperimentVenvPython(projectRoot);
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
  /** Project-relative venv path (always `.prismnext/.venv` when present). */
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

function ensurePrismVenvGitignored(projectRoot: string): void {
  if (!existsSync(join(projectRoot, ".git"))) return;
  const gitignorePath = join(projectRoot, ".gitignore");
  let content = "";
  if (existsSync(gitignorePath)) {
    try {
      content = readFileSync(gitignorePath, "utf-8");
    } catch {
      return;
    }
  }
  const line = ".prismnext/.venv/";
  if (content.includes(line) || content.includes(".prismnext/.venv")) return;
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  writeFileSync(
    gitignorePath,
    content + prefix + "\n# prismnext shared Python venv\n" + line + "\n",
    "utf-8",
  );
}

/**
 * Ensure one shared project venv at `.prismnext/.venv` for Experiment,
 * Interaction, and other project Python. Prefer `uv venv`, fall back to
 * `python3 -m venv`. Idempotent when the interpreter already exists.
 * Never installs packages into system Python. Lazy — call on first need.
 *
 * @param projectRoot Prism project root (contains `.prismnext/`). Callers that
 *   only have an experiment workspace path should pass `ctx.projectRoot` or
 *   resolve via `findPrismProjectRoot`.
 */
export function ensureExperimentPythonVenv(
  projectRoot: string,
  opts?: { runner?: ExperimentVenvRunner; workspaceRel?: string },
): EnsureExperimentPythonVenvResult {
  void opts?.workspaceRel; // retained for call-site compatibility
  const runner = opts?.runner ?? defaultVenvRunner;
  const root = pathResolve(projectRoot);
  const { venvAbs, venvRel, python } = resolveProjectPythonVenv(root);

  if (existsSync(python)) {
    return {
      ok: true,
      created: false,
      venvPath: venvRel,
      python,
      method: "existing",
    };
  }

  mkdirSync(join(root, ".prismnext"), { recursive: true });
  ensurePrismVenvGitignored(root);

  const uvCmd = `uv venv ${PRISMNEXT_VENV_REL}`;
  const uvResult = runner(uvCmd, root);
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
  const venvCmd = `${pyBin} -m venv ${PRISMNEXT_VENV_REL}`;
  const venvResult = runner(venvCmd, root);
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
    venvPath: existsSync(venvAbs) ? venvRel : null,
    python: null,
    error: `failed to create shared project venv at ${PRISMNEXT_VENV_REL} (${detail})`,
  };
}

/** Alias — same as {@link ensureExperimentPythonVenv}. */
export const ensureProjectPythonVenv = ensureExperimentPythonVenv;

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
  | {
      action: "apply";
      islandAbs: string;
      envExtra: Record<string, string>;
      python: string;
      /**
       * Non-blocking guidance, e.g. the command leads with an absolute-path
       * Python outside the shared venv — the run proceeds (project lane) but
       * the caller should declare `interpreter: "external"` instead.
       */
      warning?: string;
    }
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
 * Read-only check: would this command execute under the Experiment workspace
 * (cwd or any `cd` target)? Scopes the bash-lane external-interpreter block;
 * the venv gate proper keeps its own walk (it needs the island path too).
 */
function isUnderExperimentWorkspace(
  projectRootOpt: string | null | undefined,
  cwd: string,
  command: string,
): boolean {
  const projectRoot =
    (projectRootOpt && projectRootOpt.trim()) ||
    findPrismProjectRoot(cwd) ||
    findPrismProjectRoot(process.cwd());
  if (!projectRoot) return false;
  const resolved = resolveExperimentDir(projectRoot, join(projectRoot, ".prismnext"));
  if ("error" in resolved) return false;
  const candidates: string[] = [cwd];
  for (const cd of extractCdTargets(command)) {
    candidates.push(pathResolve(cwd, cd));
  }
  for (const candidate of candidates) {
    if (resolveExperimentIslandForPath(projectRoot, resolved.rel, candidate).underExperiment) {
      return true;
    }
  }
  return false;
}

/**
 * Hard gate for Python under a Prism project.
 *
 * Shared venv: `.prismnext/.venv` (Experiment + Interaction + other project Python).
 *
 * - Non-Python → passthrough
 * - No project root → passthrough
 * - Forbidden system pip → block
 * - External interpreters (`sage -python …`) → passthrough for the venv lane,
 *   but BLOCK via bash under the Experiment workspace (must use experiment-run)
 * - Scripts inside Experiment folder but not in an island → block (use experiment-run)
 * - Env setup (`uv pip` / `uv venv`) at workspace root or island → apply project venv
 * - Scripts in an island / elsewhere in project → ensure project venv + inject PATH
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
        `prismnext: refuse \`pip\` / \`pip3\` / \`python -m pip\` install via bash — that installs into **system Python**. ` +
        `Run \`uv pip install <pkg>\` so packages land in the shared \`${PRISMNEXT_VENV_REL}\` only.`,
    };
  }

  if (!isPythonRelatedCommand(command)) {
    // External interpreters (`sage -python …`) run Python outside the project
    // venv — the venv lane below leaves them alone (passthrough; the declared
    // `interpreter: "external"` lane handles them in the executor). But under
    // the Experiment workspace, bash must not be a backdoor around
    // experiment-run's run logging.
    if (isExternalInterpreterCommand(command)) {
      if (
        opts.blockBashPythonScripts &&
        isUnderExperimentWorkspace(opts.projectRoot, opts.cwd, command)
      ) {
        return {
          action: "block",
          error:
            `prismnext: external interpreters (\`sage -python …\`) under the Experiment workspace must run via ` +
            `\`experiment-run\` so the run is logged — bash would bypass the record. ` +
            `Pass interpreter="external" and pythonPath (e.g. "sage") so the run records the real interpreter.`,
        };
      }
    }
    return { action: "passthrough" };
  }

  const projectRoot =
    (opts.projectRoot && opts.projectRoot.trim()) ||
    findPrismProjectRoot(opts.cwd) ||
    findPrismProjectRoot(process.cwd());
  if (!projectRoot) {
    return { action: "passthrough" };
  }

  const applyProjectVenv = (): ExperimentPythonGate => {
    const ensured = ensureExperimentPythonVenv(projectRoot, opts.ensureOpts);
    if (!ensured.ok || !ensured.python) {
      return {
        action: "block",
        error:
          `prismnext: Python in this project requires the shared \`${PRISMNEXT_VENV_REL}\`. ` +
          `Could not create it: ${ensured.error ?? "unknown error"}. Install uv or python3, then retry.`,
      };
    }
    return {
      action: "apply",
      islandAbs: opts.cwd,
      python: ensured.python,
      envExtra: buildWorkspaceVenvEnvExtra(ensured.python),
      warning: externalPythonWarning(command, ensured.python),
    };
  };

  /**
   * Non-blocking nudge when the command leads with an absolute-path Python
   * that is NOT the shared project venv interpreter — the run proceeds on
   * the project lane, but the real interpreter should be declared via
   * `interpreter: "external"` so provenance records what actually ran.
   */
  function externalPythonWarning(
    cmd: string,
    ensuredPython: string,
  ): string | undefined {
    const abs = extractAbsolutePythonPath(cmd);
    if (!abs) return undefined;
    if (normalizeAbs(abs) === normalizeAbs(ensuredPython)) return undefined;
    return (
      `prismnext: command leads with an external Python (${abs}) outside the shared ` +
      `\`${PRISMNEXT_VENV_REL}\`; the project venv was still injected into PATH. ` +
      `Prefer experiment-run with interpreter="external" and pythonPath="${abs}" ` +
      `so the run records the real interpreter.`
    );
  }

  const resolved = resolveExperimentDir(projectRoot, join(projectRoot, ".prismnext"));
  if ("error" in resolved) {
    // No Experiment folder configured — still use the project venv.
    return applyProjectVenv();
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
    return applyProjectVenv();
  }

  const isSetup = isExperimentPythonSetupCommand(command);

  // Scripts need an island (logged via experiment-run). Setup may run at workspace root.
  if (!islandAbs && !isSetup) {
    return {
      action: "block",
      error:
        `prismnext: Python scripts under the Experiment workspace (\`${resolved.rel}/\`) must run inside an experiment island ` +
        `(\`${resolved.rel}/<id>/\`) via \`experiment-run\`. Env setup (\`uv pip install\`) may run from \`${resolved.rel}/\` ` +
        `and installs into the shared \`${PRISMNEXT_VENV_REL}\`.`,
    };
  }

  if (opts.blockBashPythonScripts && isExperimentPythonScriptCommand(command)) {
    return {
      action: "block",
      error:
        `prismnext: do not run Python scripts via bash inside the Experiment workspace. ` +
        `Use the \`experiment-run\` tool (id + command, pass image paths in \`artifacts\`) so the run is logged and figures appear in chat. ` +
        `Bash is only allowed for env setup (\`uv pip install\`, \`uv venv\` into \`${PRISMNEXT_VENV_REL}\`).`,
    };
  }

  if (isForbiddenSystemPythonInstall(command)) {
    return {
      action: "block",
      error:
        `prismnext: refuse system Python installs. Use \`uv pip install <pkg>\` ` +
        `so packages land in the shared \`${PRISMNEXT_VENV_REL}\` — never \`pip3\` / \`pip\` / \`python -m pip\`.`,
    };
  }

  const ensured = ensureExperimentPythonVenv(projectRoot, opts.ensureOpts);
  if (!ensured.ok || !ensured.python) {
    return {
      action: "block",
      error:
        `prismnext: Python under Experiment requires the shared \`${PRISMNEXT_VENV_REL}\`. ` +
        `Could not create it: ${ensured.error ?? "unknown error"}. Install uv or python3, then retry.`,
    };
  }

  return {
    action: "apply",
    islandAbs: islandAbs ?? workspaceAbs,
    python: ensured.python,
    envExtra: buildWorkspaceVenvEnvExtra(ensured.python),
    warning: externalPythonWarning(command, ensured.python),
  };
}

/** Detect runtime environment; Python prefers the shared project `.prismnext/.venv`. */
export function detectEnv(
  probeCwd: string,
  workspace?: { workspaceAbs: string; workspaceRel: string; projectRoot?: string },
): ExperimentEnv {
  const projectRoot =
    (workspace?.projectRoot && workspace.projectRoot.trim()) ||
    findPrismProjectRoot(probeCwd) ||
    (workspace?.workspaceAbs ? findPrismProjectRoot(workspace.workspaceAbs) : null);

  let python: string | null = null;
  let pythonVersion: string | null = null;
  let venvPath: string | null = null;

  if (projectRoot) {
    const resolved = resolveProjectPythonVenv(projectRoot);
    if (existsSync(resolved.python)) {
      python = resolved.python;
      venvPath = resolved.venvRel;
      pythonVersion =
        runShell(`"${resolved.python}" --version`, probeCwd)?.replace(/^Python\s+/i, "") ?? null;
    }
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
    venvPath,
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
  /** Default true — best-effort shared `uv venv` / `python -m venv` at `.prismnext/.venv`. */
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

// ─── append_run ──────────────────────────────────────────────────────────────

/** Grace after finishedAt when attributing files to a run (ms). */
const ARTIFACT_MTIME_GRACE_MS = 1500;
const ARTIFACT_MTIME_MAX_DEPTH = 4;
const ARTIFACT_MTIME_MAX_ENTRIES = 2000;

/**
 * Path-like tokens in command output. Any extension — artifacts are result files
 * (csv/json/npz/png/…), not an image-only type list. No folder allowlists.
 */
const OUTPUT_REL_PATH_RE =
  /(?:^|[\s"'`(=\[{])((?:[\w.-]+\/)+[\w.-]+\.[\w.-]+)\b/gi;
const OUTPUT_BASENAME_RE =
  /(?:^|[\s"'`(=\[{])([\w.-]+\.[\w]{1,12})\b/gi;

function mtimeInRunWindow(abs: string, startMs: number, endMs: number): boolean {
  try {
    const st = statSync(abs);
    return st.isFile() && st.mtimeMs >= startMs && st.mtimeMs <= endMs;
  } catch {
    return false;
  }
}

/**
 * Result files under the lab island whose mtime falls in the run window.
 * Any file type (metrics, tables, plots, archives, …). No project-folder allowlist.
 * Skips only dependency/cache/log trees that are never run outputs.
 */
export function inferArtifactsByMtimeInIsland(
  projectRoot: string,
  islandAbs: string,
  startedAt: string,
  finishedAt: string,
): string[] {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(finishedAt) + ARTIFACT_MTIME_GRACE_MS;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || !islandAbs || !existsSync(islandAbs)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  let visited = 0;

  const walk = (dir: string, depth: number): void => {
    if (depth > ARTIFACT_MTIME_MAX_DEPTH || visited > ARTIFACT_MTIME_MAX_ENTRIES) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited > ARTIFACT_MTIME_MAX_ENTRIES) break;
      if (entry.name.startsWith(".")) continue;
      if (
        entry.name === "venv" ||
        entry.name === "node_modules" ||
        entry.name === "__pycache__" ||
        entry.name === "logs"
      ) {
        continue;
      }
      const abs = join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(abs, depth + 1);
        } else if (entry.isFile()) {
          visited += 1;
          if (!mtimeInRunWindow(abs, startMs, endMs)) continue;
          const rel = normalizeArtifactSlash(relative(projectRoot, abs));
          if (!rel || rel.startsWith("..") || seen.has(rel)) continue;
          seen.add(rel);
          out.push(rel);
        }
      } catch {
        // skip
      }
    }
  };

  walk(islandAbs, 0);
  return out;
}

/**
 * Paths mentioned in stdout/stderr/notes that exist on disk and were touched in
 * the run window. Folder names and file kinds come from the text + disk — not
 * from an allowlist of directories or extensions.
 */
export function inferArtifactsFromOutputText(
  projectRoot: string,
  workspacePath: string,
  text: string,
  startedAt: string,
  finishedAt: string,
): string[] {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(finishedAt) + ARTIFACT_MTIME_GRACE_MS;
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || !text.trim()) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const tryAdd = (relRaw: string) => {
    const candidates = [
      normalizeArtifactSlash(relRaw),
      workspacePath
        ? normalizeArtifactSlash(`${workspacePath.replace(/\/$/, "")}/${relRaw}`)
        : "",
    ].filter(Boolean);
    for (const rel of candidates) {
      if (seen.has(rel) || rel.includes("..")) continue;
      const abs = join(projectRoot, rel);
      if (!mtimeInRunWindow(abs, startMs, endMs)) continue;
      seen.add(rel);
      out.push(rel);
      return;
    }
    const base = artifactBasename(relRaw);
    if (!base || !base.includes(".")) return;
    const found = findProjectRelByBasename(projectRoot, base);
    if (!found || seen.has(found)) return;
    const abs = join(projectRoot, found);
    if (!mtimeInRunWindow(abs, startMs, endMs)) return;
    seen.add(found);
    out.push(found);
  };

  for (const re of [OUTPUT_REL_PATH_RE, OUTPUT_BASENAME_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const token = m[1];
      if (token) tryAdd(token);
    }
  }
  return out;
}

/**
 * Frozen **image** copies for chat/history figure display when working paths are
 * overwritten later. Non-image artifacts stay path-only in `artifacts[]`.
 */
export function snapshotImageArtifactsForRun(
  ctx: ExperimentStorageContext,
  experimentId: string,
  runId: string,
  artifacts: string[],
): string[] {
  const snaps: string[] = [];
  const usedNames = new Set<string>();
  const destDir = join(ctx.registryRoot, experimentId, "artifacts", runId);

  for (const rel of artifacts) {
    if (!isImageArtifactPath(rel)) continue;
    const abs = join(ctx.projectRoot, normalizeArtifactSlash(rel));
    if (!existsSync(abs)) continue;
    try {
      if (!statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    mkdirSync(destDir, { recursive: true });
    let base = artifactBasename(rel) || "image.png";
    if (usedNames.has(base)) {
      const dot = base.lastIndexOf(".");
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : "";
      base = `${stem}-${randomBytes(3).toString("hex")}${ext}`;
    }
    usedNames.add(base);
    const destAbs = join(destDir, base);
    try {
      copyFileSync(abs, destAbs);
    } catch {
      continue;
    }
    snaps.push(
      normalizeArtifactSlash(
        join(EXPERIMENT_REGISTRY_REL, experimentId, "artifacts", runId, base),
      ),
    );
  }
  return snaps;
}

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
  const declared = Array.isArray(input.artifacts) ? input.artifacts : [];
  // When the agent omits artifacts[]: any result files (not image-only) —
  // (1) touched under the island, (2) paths mentioned in stdout/stderr/notes
  // that exist + mtime-match. No folder/extension allowlists.
  const inferred = [
    ...inferArtifactsByMtimeInIsland(ctx.projectRoot, island, startedAt, finishedAt),
    ...inferArtifactsFromOutputText(
      ctx.projectRoot,
      workspacePath,
      [input.stdoutTail, input.stderrTail, input.notes].filter(Boolean).join("\n"),
      startedAt,
      finishedAt,
    ),
  ];
  const artifacts = normalizeRunArtifactPaths([...declared, ...inferred], {
    workspacePath,
    existsProjectRel: (rel) => existsSync(join(ctx.projectRoot, rel)),
    findByBasename: (base) => findProjectRelByBasename(ctx.projectRoot, base),
  });
  const runId = input.runId || generateRunId();
  const artifactSnapshots = snapshotImageArtifactsForRun(ctx, id, runId, artifacts);
  const run: ExperimentRunEntry = {
    runId,
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
  if (artifactSnapshots.length > 0) run.artifactSnapshots = artifactSnapshots;
  if (input.notes) run.notes = input.notes;
  if (input.cancelled) run.cancelled = true;
  if (input.kind) run.kind = input.kind;
  if (input.logPath) run.logPath = input.logPath;
  if (input.executionId) run.executionId = input.executionId;
  if (input.transcriptPath) run.transcriptPath = input.transcriptPath;
  if (input.stderrPath) run.stderrPath = input.stderrPath;
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

/**
 * Patch `notes` on an existing run line in `runs.jsonl` (Human UI edit).
 * Empty / whitespace clears the field.
 */
export function updateRunNotes(
  ctx: ExperimentStorageContext,
  id: string,
  runId: string,
  notes: string,
): { ok: true; run: ExperimentRunEntry } | { ok: false; error: string } {
  const trimmedId = (id || "").trim();
  const trimmedRunId = (runId || "").trim();
  if (!isSafeExperimentId(trimmedId) || !trimmedRunId) {
    return { ok: false, error: "invalid_id" };
  }
  const meta = readMeta(ctx, trimmedId);
  if (!meta) {
    return { ok: false, error: "experiment_not_found" };
  }
  const rp = runsPath(ctx, trimmedId);
  if (!existsSync(rp)) {
    return { ok: false, error: "run_not_found" };
  }
  let raw: string;
  try {
    raw = readFileSync(rp, "utf-8");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let updated: ExperimentRunEntry | null = null;
  const nextLines: string[] = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as ExperimentRunEntry;
      if (entry.runId === trimmedRunId) {
        const next: ExperimentRunEntry = { ...entry };
        const note = notes.trim();
        if (note) next.notes = note;
        else delete next.notes;
        updated = next;
        nextLines.push(JSON.stringify(next));
      } else {
        nextLines.push(line);
      }
    } catch {
      nextLines.push(line);
    }
  }
  if (!updated) {
    return { ok: false, error: "run_not_found" };
  }
  try {
    writeFileSync(rp, nextLines.length > 0 ? `${nextLines.join("\n")}\n` : "", "utf-8");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, run: updated };
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
    ensureExperimentPythonVenv(ctx.projectRoot, {
      runner: opts?.venvRunner,
    });
  }
  return {
    ok: true,
    env: detectEnv(island, {
      workspaceAbs: ctx.workspaceAbs,
      workspaceRel: ctx.workspaceRel,
      projectRoot: ctx.projectRoot,
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
