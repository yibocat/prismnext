/**
 * Workbench path constants and relative joins.
 *
 * Project metadata lives in `.workbench/`. The application home is
 * `~/.prismnext/`. Do not reuse the home dirname as a project marker.
 */

export const PROJECT_META_DIR = ".workbench";
export const WORKBENCH_HOME_DIRNAME = ".prismnext";
export const WORKBENCH_JSON_FILENAME = "workbench.json";
export const PROJECT_COMPILE_DIRNAME = "compile";

export const PROJECTS_DIRNAME = "projects";
export const LIBRARY_DIRNAME = "library";
export const WORKTREES_DIRNAME = "worktrees";
export const WORKTREE_CHECKOUT_DIRNAME = "checkout";

export const HOME_SESSIONS_DIRNAME = "sessions";
export const HOME_SKILLS_DIRNAME = "skills";
export const HOME_TEAMS_DIRNAME = "teams";
export const HOME_BROWSER_DIRNAME = "browser";
export const HOME_JOBS_DIRNAME = "jobs";
export const HOME_RUNTIME_SESSIONS_DIRNAME = "runtime-sessions";
export const HOME_SETTINGS_FILENAME = "settings.json";
export const HOME_SKILLS_MANIFEST_FILENAME = "skills-manifest.json";
export const HOME_TEAMS_STATE_FILENAME = "teams-state.json";
export const PROJECT_SLOT_META_FILENAME = "meta.json";
/** Built-in first-run folder under the platform Documents directory (D-18). */
export const BUILTIN_DEFAULT_PROJECT_DIRNAME = "PrismNext";

function posixJoin(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

export function workbenchJsonRel(): string {
  return posixJoin(PROJECT_META_DIR, WORKBENCH_JSON_FILENAME);
}

/** Paper compile cache, relative to the project root. */
export function projectCompileRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_COMPILE_DIRNAME);
}

export function projectSlotRel(projectId: string): string {
  return posixJoin(PROJECTS_DIRNAME, projectId);
}

export function projectSlotMetaRel(projectId: string): string {
  return posixJoin(PROJECTS_DIRNAME, projectId, PROJECT_SLOT_META_FILENAME);
}

export function libraryRel(projectId: string): string {
  return posixJoin(PROJECTS_DIRNAME, projectId, LIBRARY_DIRNAME);
}

export function homeSkillsRel(skillId?: string): string {
  return skillId ? posixJoin(HOME_SKILLS_DIRNAME, skillId) : HOME_SKILLS_DIRNAME;
}

export function worktreeSlotRel(projectId: string, worktreeId: string): string {
  return posixJoin(PROJECTS_DIRNAME, projectId, WORKTREES_DIRNAME, worktreeId);
}

export function worktreeCheckoutRel(projectId: string, worktreeId: string): string {
  return posixJoin(
    PROJECTS_DIRNAME,
    projectId,
    WORKTREES_DIRNAME,
    worktreeId,
    WORKTREE_CHECKOUT_DIRNAME,
  );
}

/**
 * `…/.prismnext/projects/<id>/worktrees/<wtId>/checkout` (or a file under it).
 * Path-only: does not check that this is the current machine's home.
 */
export function parseHomeWorktreeCheckoutPath(
  absPath: string,
): { projectId: string; worktreeId: string } | null {
  const n = normalizeWorkbenchPath(absPath.replace(/\\/g, "/"));
  const marker = `/${WORKBENCH_HOME_DIRNAME}/${PROJECTS_DIRNAME}/`;
  const idx = n.indexOf(marker);
  if (idx < 0) return null;
  const rest = n.slice(idx + marker.length);
  const parts = rest.split("/");
  if (parts.length < 4) return null;
  const [projectId, worktrees, worktreeId, checkout] = parts;
  if (
    !projectId
    || worktrees !== WORKTREES_DIRNAME
    || !worktreeId
    || checkout !== WORKTREE_CHECKOUT_DIRNAME
  ) {
    return null;
  }
  return { projectId, worktreeId };
}

export function isHomeWorktreeCheckoutPath(absPath: string): boolean {
  return parseHomeWorktreeCheckoutPath(absPath) !== null;
}

/** Resolve + unify slashes + drop trailing slash (except root). */
export function normalizeWorkbenchPath(absPath: string): string {
  const resolved = absPath.replace(/\\/g, "/");
  // Keep this path-only: callers that need realpath inject it themselves.
  const trimmed = resolved.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}
