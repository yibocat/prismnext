/**
 * Shared project Python venv + bash/experiment-run execution gate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve as pathResolve } from "node:path";
import { resolveExperimentDir } from "../project/workspace-config";
import { PROJECT_META_DIR } from "../../shared/workbench/paths";
import {
  EXPERIMENT_VENV_DIR,
  PRISMNEXT_VENV_REL,
  extractAbsolutePythonPath,
  isExperimentPythonScriptCommand,
  isExperimentPythonSetupCommand,
  isExternalInterpreterCommand,
  isForbiddenSystemPythonInstall,
  isPythonRelatedCommand,
  type ExperimentEnv,
} from "../../shared/experiments/log";
import {
  extractCdTargets,
  findPrismProjectRoot,
  normalizeAbs,
  resolveExperimentIslandForPath,
  type ExperimentStorageContext,
} from "./context";
import { readMeta, workspaceIslandAbs } from "./registry";

const IS_WIN = process.platform === "win32";

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
 * (`.workbench/.venv` — may not exist yet).
 */
export function resolveProjectPythonVenv(projectRoot: string): {
  venvAbs: string;
  venvRel: string;
  python: string;
} {
  const root = pathResolve(projectRoot);
  const venvAbs = join(root, PROJECT_META_DIR, EXPERIMENT_VENV_DIR);
  const python = IS_WIN
    ? join(venvAbs, "Scripts", "python.exe")
    : join(venvAbs, "bin", "python");
  return { venvAbs, venvRel: PRISMNEXT_VENV_REL, python };
}

/**
 * Absolute path to the shared project venv Python interpreter.
 * `projectRoot` is the PrismNext project root (directory that contains `.workbench/`).
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
  /** Project-relative venv path (always `.workbench/.venv` when present). */
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
  const line = `${PRISMNEXT_VENV_REL}/`;
  if (content.includes(line) || content.includes(PRISMNEXT_VENV_REL)) return;
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  writeFileSync(
    gitignorePath,
    content + prefix + "\n# prismnext shared Python venv\n" + line + "\n",
    "utf-8",
  );
}

/**
 * Ensure one shared project venv at `.workbench/.venv` for Experiment,
 * Interaction, and other project Python. Prefer `uv venv`, fall back to
 * `python3 -m venv`. Idempotent when the interpreter already exists.
 * Never installs packages into system Python. Lazy — call on first need.
 *
 * @param projectRoot PrismNext project root (contains `.workbench/`). Callers that
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

  mkdirSync(join(root, PROJECT_META_DIR), { recursive: true });
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
  const resolved = resolveExperimentDir(projectRoot);
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
 * Shared venv: `.workbench/.venv` (Experiment + Interaction + other project Python).
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

  const resolved = resolveExperimentDir(projectRoot);
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

/** Detect runtime environment; Python prefers the shared project `.workbench/.venv`. */
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
