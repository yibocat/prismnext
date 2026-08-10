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
import { syncProjectSkillsIntegration } from "./skills-sync";
import { normalizeProjectRoot } from "./skills-sync";
import { invalidateProjectChatPrewarm } from "./project-chat-prewarm";
import { createLogger } from "./logger";

const log = createLogger("project-skills-refresh");

/** Last applied skills integration key per project — avoids redundant opencode.json writes. */
const lastAppliedSkillsKey = new Map<string, string>();

function computeSkillsIntegrationKey(projectRoot: string): string {
  const result = syncProjectSkillsIntegration(projectRoot);
  return JSON.stringify({
    root: normalizeProjectRoot(projectRoot),
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
): Promise<RefreshProjectSkillsResult> {
  const root = normalizeProjectRoot(projectPath);
  const result = syncProjectSkillsIntegration(projectPath);
  const acp = AcpService.getInstanceForProject(root);
  const { configPath, changed: configChanged } = acp.applyProjectSkillsIntegration(projectPath, {
    skillsPaths: result.skillsPaths,
    skillPermissions: result.skillPermissions,
  });
  const key = computeSkillsIntegrationKey(projectPath);
  lastAppliedSkillsKey.set(root, key);
  acp.prewarmProject(projectPath);
  notifySkillsIntegrationChanged(projectPath);
  return { ...result, configPath, configChanged, skipped: false };
}

/** Skip opencode.json rewrite when skills patch is unchanged. */
export async function refreshProjectSkillsIntegrationIfNeeded(
  projectPath: string,
): Promise<RefreshProjectSkillsResult> {
  const root = normalizeProjectRoot(projectPath);
  const key = computeSkillsIntegrationKey(projectPath);
  if (lastAppliedSkillsKey.get(root) === key) {
    const result = syncProjectSkillsIntegration(projectPath);
    const acp = AcpService.getInstanceForProject(root);
    acp.prewarmProject(projectPath);
    return {
      ...result,
      configPath: join(app.getPath("userData"), "opencode-server", "config", "opencode", "opencode.json"),
      configChanged: false,
      skipped: true,
    };
  }
  return refreshProjectSkillsIntegration(projectPath);
}

/** Skills file changed on disk — sync then restart OpenCode so config is loaded. */
export async function refreshProjectSkillsIntegrationWithReload(
  projectPath: string,
): Promise<RefreshProjectSkillsResult> {
  const result = await refreshProjectSkillsIntegrationIfNeeded(projectPath);
  const acp = AcpService.getInstanceForProject(normalizeProjectRoot(projectPath));
  if (!result.skipped && result.configChanged && acp.getConnection()) {
    await acp.reloadAfterSkillsIntegration();
  }
  return result;
}

export function invalidateProjectSkillsIntegrationCache(projectPath: string): void {
  lastAppliedSkillsKey.delete(normalizeProjectRoot(projectPath));
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleSkillsRefresh(projectPath: string): void {
  invalidateProjectChatPrewarm(projectPath);
  invalidateProjectSkillsIntegrationCache(projectPath);
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

/** Check if a file path change should trigger a skills refresh (agent dir paths). */
export function isSkillsIntegrationPath(absPath: string, projectRoot: string): boolean {
  const normalized = absPath.replace(/\\/g, "/");
  const root = projectRoot.replace(/\\/g, "/");
  return (
    normalized.includes(`${root}/.prismnext/agent/local/`)
    || normalized.includes(`${root}/.prismnext/agent/teams/project.local/`)
    || normalized.endsWith(`${root}/.prismnext/agent/teams.json`)
    || normalized.includes(`${root}/.prismnext/agent/experts/`)
    || normalized.endsWith(`${root}/.prismnext/agent/experts-manifest.json`)
    || normalized.endsWith(`${root}/.prismnext/agent/orchestrators-manifest.json`)
  );
}

/** Derive the project root from an agent-dir file path. */
export function projectRootFromAgentPath(absPath: string): string | null {
  const normalized = absPath.replace(/\\/g, "/");
  const idx = normalized.indexOf("/.prismnext/agent/");
  if (idx < 0) return null;
  return normalized.slice(0, idx);
}

/** Schedule a skills refresh from a file-system watcher path. */
export function scheduleSkillsRefreshFromAgentPath(absPath: string): void {
  const root = projectRootFromAgentPath(absPath);
  if (root) scheduleSkillsRefresh(root);
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
