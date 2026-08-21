import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { WorkbenchHomeSettings } from "../../shared/workbench-api";
import {
  HOME_BROWSER_DIRNAME,
  HOME_JOBS_DIRNAME,
  HOME_RUNTIME_SESSIONS_DIRNAME,
  HOME_SESSIONS_DIRNAME,
  HOME_SETTINGS_FILENAME,
  HOME_SKILLS_DIRNAME,
  HOME_TEAMS_DIRNAME,
  PROJECT_META_DIR,
  PROJECTS_DIRNAME,
  WORKBENCH_HOME_DIRNAME,
  WORKBENCH_JSON_FILENAME,
  normalizeWorkbenchPath,
} from "../../shared/workbench-paths";

export interface WorkbenchHomeOpts {
  homeDir?: string;
}

let userHomeOverride: string | null = null;

/** Test-only: treat `dir` as the user home (`~`) so workbench home becomes `dir/.prismnext`. */
export function setWorkbenchUserHomeOverride(dir: string | null): void {
  userHomeOverride = dir;
}

function resolveUserHome(opts?: WorkbenchHomeOpts): string {
  return resolve(opts?.homeDir ?? userHomeOverride ?? homedir());
}

export function resolveWorkbenchHome(opts?: WorkbenchHomeOpts): string {
  return normalizeWorkbenchPath(join(resolveUserHome(opts), WORKBENCH_HOME_DIRNAME));
}

export function ensureWorkbenchHome(opts?: WorkbenchHomeOpts): string {
  const home = resolveWorkbenchHome(opts);
  for (const rel of [
    HOME_SESSIONS_DIRNAME,
    PROJECTS_DIRNAME,
    HOME_SKILLS_DIRNAME,
    HOME_TEAMS_DIRNAME,
    HOME_BROWSER_DIRNAME,
    HOME_JOBS_DIRNAME,
    HOME_RUNTIME_SESSIONS_DIRNAME,
    "runtime",
  ]) {
    mkdirSync(join(home, rel), { recursive: true });
  }
  const settingsPath = join(home, HOME_SETTINGS_FILENAME);
  if (!existsSync(settingsPath)) {
    writeFileSync(
      settingsPath,
      `${JSON.stringify({ defaultProjectId: null, workbenchProjectIds: [] }, null, 2)}\n`,
      "utf-8",
    );
  }
  return home;
}

const EMPTY_HOME_SETTINGS: WorkbenchHomeSettings = {
  defaultProjectId: null,
  workbenchProjectIds: [],
};

export function readWorkbenchHomeSettings(opts?: WorkbenchHomeOpts): WorkbenchHomeSettings {
  const file = join(resolveWorkbenchHome(opts), HOME_SETTINGS_FILENAME);
  if (!existsSync(file)) return { ...EMPTY_HOME_SETTINGS };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return { ...EMPTY_HOME_SETTINGS };
  }
  if (!raw || typeof raw !== "object") return { ...EMPTY_HOME_SETTINGS };
  const rec = raw as { defaultProjectId?: unknown; workbenchProjectIds?: unknown };
  const defaultProjectId =
    typeof rec.defaultProjectId === "string" && rec.defaultProjectId.trim()
      ? rec.defaultProjectId.trim()
      : null;
  const workbenchProjectIds = Array.isArray(rec.workbenchProjectIds)
    ? rec.workbenchProjectIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  return { defaultProjectId, workbenchProjectIds };
}

export function writeWorkbenchHomeSettings(
  settings: WorkbenchHomeSettings,
  opts?: WorkbenchHomeOpts,
): void {
  const home = ensureWorkbenchHome(opts);
  const file = join(home, HOME_SETTINGS_FILENAME);
  let extra: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf-8"));
      if (raw && typeof raw === "object") extra = raw as Record<string, unknown>;
    } catch {
      extra = {};
    }
  }
  const ids = [...new Set(settings.workbenchProjectIds.map((id) => id.trim()).filter(Boolean))];
  const defaultProjectId = settings.defaultProjectId?.trim() || null;
  writeFileSync(
    file,
    `${JSON.stringify({
      ...extra,
      defaultProjectId,
      workbenchProjectIds: defaultProjectId && !ids.includes(defaultProjectId)
        ? [defaultProjectId, ...ids]
        : ids,
    }, null, 2)}\n`,
    "utf-8",
  );
}

export function isWorkbenchHomePath(absPath: string, opts?: WorkbenchHomeOpts): boolean {
  return normalizeWorkbenchPath(resolve(absPath)) === resolveWorkbenchHome(opts);
}

export function isPathInsideWorkbenchHome(absPath: string, opts?: WorkbenchHomeOpts): boolean {
  const home = resolveWorkbenchHome(opts);
  const child = normalizeWorkbenchPath(resolve(absPath));
  if (child === home) return false;
  return child.startsWith(`${home}/`);
}

function isHomeOrInside(absPath: string, opts?: WorkbenchHomeOpts): boolean {
  return isWorkbenchHomePath(absPath, opts) || isPathInsideWorkbenchHome(absPath, opts);
}

export function isWorkbenchProjectRoot(
  dir: string,
  opts?: WorkbenchHomeOpts & { existsFile?: (abs: string) => boolean },
): boolean {
  const abs = normalizeWorkbenchPath(resolve(dir));
  if (isHomeOrInside(abs, opts)) return false;
  const marker = join(abs, PROJECT_META_DIR, WORKBENCH_JSON_FILENAME);
  const exists = opts?.existsFile ?? existsSync;
  return exists(marker);
}

const MAX_WALK = 48;

/**
 * Walk up from `startPath` looking for `D/.workbench/workbench.json`.
 * Never returns the workbench home or anything inside it.
 */
export function findWorkbenchProjectRoot(
  startPath: string,
  opts?: WorkbenchHomeOpts & { existsFile?: (abs: string) => boolean },
): string | null {
  let cur = normalizeWorkbenchPath(resolve(startPath || ""));
  for (let i = 0; i < MAX_WALK; i++) {
    if (isWorkbenchProjectRoot(cur, opts)) return cur;
    const parent = normalizeWorkbenchPath(dirname(cur));
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}
