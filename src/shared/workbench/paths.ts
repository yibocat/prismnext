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
export const PROJECT_AGENT_DIRNAME = "agent";
export const PROJECT_AGENTS_MD_FILENAME = "AGENTS.md";
export const PROJECT_RULES_DIRNAME = "rules";
export const PROJECT_TEAMS_DIRNAME = "teams";
export const PROJECT_TEAMS_STATE_FILENAME = "teams.json";
export const PROJECT_INTERACTIONS_DIRNAME = "interactions";
export const PROJECT_EXPERIMENTS_DIRNAME = "experiments";
export const PROJECT_VENV_DIRNAME = ".venv";
export const PROJECT_PROVENANCE_FILENAME = "provenance.jsonl";
export const PROJECT_TERMINAL_DIRNAME = "terminal";
export const PROJECT_RESEARCH_DIRNAME = "research";
export const PROJECT_PLANS_DIRNAME = "plans";
export const PROJECT_STATE_DIRNAME = "state";

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
/** Remote Host BYOK envelope (`~/.prismnext/host-model.json`, AES-256-GCM). Not the desktop electron-store. */
export const HOME_HOST_MODEL_FILENAME = "host-model.json";
export const HOME_SKILLS_MANIFEST_FILENAME = "skills-manifest.json";
export const HOME_TEAMS_STATE_FILENAME = "teams-state.json";
/** Remote Host install root on the *server* (`~/.prismnext-host`), not app home. */
export const HOST_INSTALL_DIRNAME = ".prismnext-host";
export const HOST_CURRENT_DIRNAME = "current";
export const HOST_STAMP_FILENAME = "stamp.json";
/** Server-side download cache for Node / Git / Tectonic (`~/.prismnext-host/cache/`). */
export const HOST_CACHE_DIRNAME = "cache";
/** Versions the server already downloaded. Text pin format, not JSON. */
export const HOST_RUNTIME_STAMP_FILENAME = "runtime-stamp.txt";
/** Pro teams data pushed beside the Host payload — never inside `current/` / the public tarball. */
export const HOST_PRO_PACKAGE_DIRNAME = "pro-package";
export const HOST_PRO_SYNC_STAMP_FILENAME = ".sync-stamp.json";
/** Local on-demand cache under `~/.prismnext/remote-cache/`. */
export const REMOTE_CACHE_DIRNAME = "remote-cache";
export const HOME_SSH_DIRNAME = "ssh";
export const HOME_KNOWN_HOSTS_FILENAME = "known_hosts";
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

/** Project agent instructions — this is the file Settings and Pi both read. */
export function projectAgentsMdRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_AGENT_DIRNAME, PROJECT_AGENTS_MD_FILENAME);
}

export function projectRulesRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_AGENT_DIRNAME, PROJECT_RULES_DIRNAME);
}

export function projectTeamsRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_AGENT_DIRNAME, PROJECT_TEAMS_DIRNAME);
}

export function projectTeamsStateRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_AGENT_DIRNAME, PROJECT_TEAMS_STATE_FILENAME);
}

export function projectInteractionsRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_INTERACTIONS_DIRNAME);
}

export function projectExperimentsRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_EXPERIMENTS_DIRNAME);
}

export function projectVenvRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_VENV_DIRNAME);
}

export function projectProvenanceRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_PROVENANCE_FILENAME);
}

export function projectTerminalDirRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_TERMINAL_DIRNAME);
}

export function projectResearchPlansRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_RESEARCH_DIRNAME, PROJECT_PLANS_DIRNAME);
}

export function projectCheckpointsRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_STATE_DIRNAME, "checkpoints");
}

export function projectSessionsDisplayRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_STATE_DIRNAME, "sessions-display.json");
}

export function projectSessionsContextRel(): string {
  return posixJoin(PROJECT_META_DIR, PROJECT_STATE_DIRNAME, "sessions-context.json");
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

/** Remote install root name only — lives next to the user's home, not under `.prismnext`. */
export function hostInstallRel(): string {
  return HOST_INSTALL_DIRNAME;
}

export function hostCurrentRel(): string {
  return posixJoin(HOST_INSTALL_DIRNAME, HOST_CURRENT_DIRNAME);
}

export function hostStampRel(): string {
  return posixJoin(HOST_INSTALL_DIRNAME, HOST_CURRENT_DIRNAME, HOST_STAMP_FILENAME);
}

export function hostCacheRel(): string {
  return posixJoin(HOST_INSTALL_DIRNAME, HOST_CACHE_DIRNAME);
}

export function hostRuntimeStampRel(): string {
  return posixJoin(HOST_INSTALL_DIRNAME, HOST_RUNTIME_STAMP_FILENAME);
}

export function hostProPackageRel(): string {
  return posixJoin(HOST_INSTALL_DIRNAME, HOST_PRO_PACKAGE_DIRNAME);
}

export function remoteCacheRel(profileId: string, projectId: string): string {
  return posixJoin(REMOTE_CACHE_DIRNAME, profileId, projectId);
}

export function homeKnownHostsRel(): string {
  return posixJoin(HOME_SSH_DIRNAME, HOME_KNOWN_HOSTS_FILENAME);
}

/** Session citation scratch next to the product session json (not Application Support). */
export function sessionCitationsRel(conversationId: string): string {
  return posixJoin(HOME_SESSIONS_DIRNAME, conversationId, "citations");
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
