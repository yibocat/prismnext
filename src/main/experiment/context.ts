/**
 * Experiment storage context — registry vs workspace lab paths.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { resolveExperimentDir } from "../project/workspace-config";
import { EXPERIMENT_REGISTRY_REL } from "../../shared/experiments/log";
import { PROJECT_META_DIR } from "../../shared/workbench/paths";

/** Hint surfaced to UI / agent when the project has no Workspace Experiment folder configured. */
export const NO_EXPERIMENT_FOLDER_HINT =
  "Add an Experiment folder in Settings → Workspace (function: Experiment) before creating or running experiments.";

/**
 * Resolve the experiment storage context for a project, or surface a
 * `no_experiment_folder` error. Shared by the agent dispatch and the UI IPC
 * so the error shape stays identical.
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
  const resolved = resolveExperimentDir(projectRoot);
  if ("error" in resolved) {
    return { ok: false, error: "no_experiment_folder", hint: NO_EXPERIMENT_FOLDER_HINT };
  }
  return buildExperimentStorageContext(projectRoot, resolved.rel);
}


/** Resolved paths for one project + Workspace experiment folder. */
export interface ExperimentStorageContext {
  projectRoot: string;
  /** Absolute `.workbench/experiments` */
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

/** Walk up from a path looking for a `.workbench` directory (project root). */
export function findPrismProjectRoot(start: string): string | null {
  let cur = pathResolve(start || "");
  for (let i = 0; i < 48; i++) {
    const marker = join(cur, PROJECT_META_DIR);
    if (existsSync(marker)) {
      return cur.replace(/\\/g, "/");
    }
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

export { normalizeAbs, isPathInside };

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
