/**
 * project-skills-refresh.ts — keep project skill files tidy and notify the UI.
 * Pi sessions load skills through ClosedResourceLoader; this path no longer
 * writes OpenCode config or restarts an OpenCode child.
 */
import { getHostEvents } from "../app/event-sink";
import {
  syncProjectSkillsIntegration,
  normalizeProjectRoot,
  isSkillsIntegrationPath,
  projectRootFromAgentPath,
  type SkillPermissionScope,
} from "./skills-sync";
import { createLogger } from "../app/logger";

/** Re-export path helpers — single source of truth lives in skills-sync. */
export { isSkillsIntegrationPath, projectRootFromAgentPath };

const log = createLogger("project-skills-refresh");

/** Last applied skills integration key per project — avoids redundant disk sync. */
const lastAppliedSkillsKey = new Map<string, string>();

function computeSkillsIntegrationKey(
  projectRoot: string,
  scope?: SkillPermissionScope,
): string {
  const result = syncProjectSkillsIntegration(projectRoot, scope);
  return JSON.stringify({
    root: normalizeProjectRoot(projectRoot),
    teamId: scope?.teamId ?? null,
    extra: [...(scope?.extraAllowIds ?? [])].sort(),
    paths: result.skillsPaths,
    perms: result.skillPermissions,
  });
}

export function notifySkillsIntegrationChanged(projectPath: string): void {
  getHostEvents().broadcast("skills:integrationChanged", { projectPath });
}

export interface RefreshProjectSkillsResult {
  skillsCount: number;
  skillsPaths: string[];
  skillPermissions: Record<string, string>;
  configPath: string;
  configChanged: boolean;
  skipped: boolean;
}

/** Sync project skill files and notify the renderer. Does not write opencode.json. */
export async function refreshProjectSkillsIntegration(
  projectPath: string,
  scope?: SkillPermissionScope,
): Promise<RefreshProjectSkillsResult> {
  const root = normalizeProjectRoot(projectPath);
  const result = syncProjectSkillsIntegration(projectPath, scope);
  const key = computeSkillsIntegrationKey(projectPath, scope);
  lastAppliedSkillsKey.set(root, key);
  notifySkillsIntegrationChanged(projectPath);
  return {
    ...result,
    configPath: "",
    configChanged: false,
    skipped: false,
  };
}

/** Skip a second disk sync when the skills patch is unchanged. */
export async function refreshProjectSkillsIntegrationIfNeeded(
  projectPath: string,
  scope?: SkillPermissionScope,
): Promise<RefreshProjectSkillsResult> {
  const root = normalizeProjectRoot(projectPath);
  const key = computeSkillsIntegrationKey(projectPath, scope);
  if (lastAppliedSkillsKey.get(root) === key) {
    const result = syncProjectSkillsIntegration(projectPath, scope);
    return {
      ...result,
      configPath: "",
      configChanged: false,
      skipped: true,
    };
  }
  return refreshProjectSkillsIntegration(projectPath, scope);
}

/** Skills file changed on disk — sync files and notify. New Pi chats pick skills up. */
export async function refreshProjectSkillsIntegrationWithReload(
  projectPath: string,
): Promise<RefreshProjectSkillsResult> {
  return refreshProjectSkillsIntegrationIfNeeded(projectPath);
}

export function invalidateProjectSkillsIntegrationCache(projectPath: string): void {
  lastAppliedSkillsKey.delete(normalizeProjectRoot(projectPath));
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounced skills sync after a real skills-affecting disk change.
 */
export function scheduleSkillsRefresh(projectPath: string): void {
  const existing = pendingTimers.get(projectPath);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    projectPath,
    setTimeout(() => {
      pendingTimers.delete(projectPath);
      void refreshProjectSkillsIntegrationWithReload(projectPath).catch((err) => {
        log.warn("skills refresh deferred", { error: err instanceof Error ? err.message : String(err) });
      });
    }, 800),
  );
}

/** Schedule a skills refresh from a file-system watcher / IPC path. */
export function scheduleSkillsRefreshFromAgentPath(absPath: string): void {
  const root = projectRootFromAgentPath(absPath);
  if (!root) return;
  if (!isSkillsIntegrationPath(absPath, root)) return;
  scheduleSkillsRefresh(root);
}

/** Schedule a skills refresh from a set of changed paths (fs watcher). */
export function scheduleSkillsRefreshFromPaths(
  projectRoot: string,
  paths: string[] | undefined,
): void {
  if (!paths?.length) return;
  if (!paths.some((p) => isSkillsIntegrationPath(p, projectRoot))) return;
  scheduleSkillsRefresh(projectRoot);
}
