/**
 * project-skills-refresh.ts — sync project skills to the app-level OpenCode
 * config (design §7.2, B4/B5 fix).
 *
 * The cache key includes the resolver viewKey (catalog fingerprint + state
 * counters + license version) so a project switch always rewrites the
 * config (B4 fix — the old code keyed only on projectRoot and skipped
 * rewrites when returning to a previously-seen project).
 */
import { BrowserWindow, app } from "electron";
import { join } from "node:path";
import { AcpService } from "../acp/service";
import {
  syncProjectSkillsIntegration,
  normalizeProjectRoot,
  isSkillsIntegrationPath,
  projectRootFromAgentPath,
  type SkillPermissionScope,
} from "./skills-sync";
import { invalidateProjectChatPrewarm } from "./project-chat-prewarm";
import { createLogger } from "./logger";

/** Re-export path helpers — single source of truth lives in skills-sync. */
export { isSkillsIntegrationPath, projectRootFromAgentPath };

const log = createLogger("project-skills-refresh");

/** Last applied skills integration key per project — avoids redundant opencode.json writes. */
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
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("skills:integrationChanged", { projectPath });
    }
  }
}

export interface RefreshProjectSkillsResult {
  skillsCount: number;
  skillsPaths: string[];
  skillPermissions: Record<string, string>;
  configPath: string;
  configChanged: boolean;
  skipped: boolean;
}

/** Sync project skills on disk + app-level OpenCode config + agent config cache. */
export async function refreshProjectSkillsIntegration(
  projectPath: string,
  scope?: SkillPermissionScope,
): Promise<RefreshProjectSkillsResult> {
  const root = normalizeProjectRoot(projectPath);
  const result = syncProjectSkillsIntegration(projectPath, scope);
  const acp = AcpService.getInstanceForProject(root);
  const { configPath, changed: configChanged } = acp.applyProjectSkillsIntegration(projectPath, {
    skillsPaths: result.skillsPaths,
    skillPermissions: result.skillPermissions,
  });
  const key = computeSkillsIntegrationKey(projectPath, scope);
  lastAppliedSkillsKey.set(root, key);
  acp.prewarmProject(projectPath);
  notifySkillsIntegrationChanged(projectPath);
  return { ...result, configPath, configChanged, skipped: false };
}

/** Skip opencode.json rewrite when skills patch is unchanged. */
export async function refreshProjectSkillsIntegrationIfNeeded(
  projectPath: string,
  scope?: SkillPermissionScope,
): Promise<RefreshProjectSkillsResult> {
  const root = normalizeProjectRoot(projectPath);
  const key = computeSkillsIntegrationKey(projectPath, scope);
  if (lastAppliedSkillsKey.get(root) === key) {
    const result = syncProjectSkillsIntegration(projectPath, scope);
    const acp = AcpService.getInstanceForProject(root);
    acp.prewarmProject(projectPath);
    return {
      ...result,
      configPath: join(app.getPath("userData"), "opencode-server", "config", "opencode", "opencode.json"),
      configChanged: false,
      skipped: true,
    };
  }
  return refreshProjectSkillsIntegration(projectPath, scope);
}

/** Skills file changed on disk — sync then restart OpenCode so config is loaded. */
export async function refreshProjectSkillsIntegrationWithReload(
  projectPath: string,
): Promise<RefreshProjectSkillsResult> {
  const result = await refreshProjectSkillsIntegrationIfNeeded(projectPath);
  const acp = AcpService.getInstanceForProject(normalizeProjectRoot(projectPath));
  if (!result.skipped && result.configChanged && acp.getConnection()) {
    // Fresh children already read config from disk; a reload right after spawn
    // (or during/after a turn via the FS watcher) is pure latency.
    if (acp.wasSpawnedRecently()) {
      log.info("skills refresh — skip reload (just spawned)", {
        projectPath,
        spawnAgeMs: Date.now() - acp.getLastSpawnAtMs(),
      });
    } else {
      invalidateProjectChatPrewarm(projectPath);
      await acp.reloadAfterSkillsIntegration();
    }
  }
  return result;
}

export function invalidateProjectSkillsIntegrationCache(projectPath: string): void {
  lastAppliedSkillsKey.delete(normalizeProjectRoot(projectPath));
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounced skills sync after a real skills-affecting disk change.
 * Does NOT invalidate the apply-cache up front — that forced every watcher
 * tick (including prompt `_prism-system.md` writes) to rewrite + restart.
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
  // skills-sync helper excludes prompt/expert writes (`_prism-system.md`, etc.).
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
