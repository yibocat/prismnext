import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import {
  isSkillsIntegrationPath,
  isSkillsManifestPath,
  normalizeProjectRoot,
  projectRootFromAgentPath,
  syncProjectSkillsIntegration,
} from "./skills-sync";
import { invalidateProjectChatPrewarm } from "./project-chat-prewarm";
import { AcpService } from "../acp/service";

const SKILLS_REFRESH_DEBOUNCE_MS = 800;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Last applied skills integration key per project — avoids redundant opencode.json writes. */
const lastAppliedSkillsKey = new Map<string, string>();

function computeSkillsIntegrationKey(
  projectRoot: string,
  options?: { profileSkillAllowlist?: string[] },
): string {
  const result = syncProjectSkillsIntegration(projectRoot, options);
  const allowlist = [...(options?.profileSkillAllowlist ?? [])].sort().join(",");
  return JSON.stringify({
    root: normalizeProjectRoot(projectRoot),
    paths: result.skillsPaths,
    perms: result.skillPermissions,
    allowlist,
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
  registryUrls: string[];
  configPath: string;
  configChanged: boolean;
  skipped: boolean;
}

/** Sync project skills on disk + app-level OpenCode config + agent config cache. */
export async function refreshProjectSkillsIntegration(
  projectPath: string,
  options?: { profileSkillAllowlist?: string[] },
): Promise<RefreshProjectSkillsResult> {
  const root = normalizeProjectRoot(projectPath);
  const result = syncProjectSkillsIntegration(projectPath, options);
  const acp = AcpService.getInstance();
  const { configPath, changed: configChanged } = acp.applyProjectSkillsIntegration(projectPath, {
    skillsPaths: result.skillsPaths,
    skillPermissions: result.skillPermissions,
  });
  const key = computeSkillsIntegrationKey(projectPath, options);
  lastAppliedSkillsKey.set(root, key);
  acp.prewarmProject(projectPath);
  notifySkillsIntegrationChanged(projectPath);
  return { ...result, configPath, configChanged, skipped: false };
}

/** Skip opencode.json rewrite when skills patch is unchanged. */
export async function refreshProjectSkillsIntegrationIfNeeded(
  projectPath: string,
  options?: { profileSkillAllowlist?: string[] },
): Promise<RefreshProjectSkillsResult> {
  const root = normalizeProjectRoot(projectPath);
  const key = computeSkillsIntegrationKey(projectPath, options);
  if (lastAppliedSkillsKey.get(root) === key) {
    const result = syncProjectSkillsIntegration(projectPath, options);
    const acp = AcpService.getInstance();
    acp.prewarmProject(projectPath);
    return {
      ...result,
      configPath: join(app.getPath("userData"), "opencode-server", "config", "opencode", "opencode.json"),
      configChanged: false,
      skipped: true,
    };
  }
  return refreshProjectSkillsIntegration(projectPath, options);
}

/** Skills file changed on disk — sync then restart OpenCode so config is loaded. */
export async function refreshProjectSkillsIntegrationWithReload(
  projectPath: string,
  options?: { profileSkillAllowlist?: string[] },
): Promise<RefreshProjectSkillsResult> {
  const result = await refreshProjectSkillsIntegrationIfNeeded(projectPath, options);
  const acp = AcpService.getInstance();
  if (!result.skipped && result.configChanged && acp.getConnection()) {
    await acp.reloadAfterSkillsIntegration();
  }
  return result;
}

export function invalidateProjectSkillsIntegrationCache(projectPath: string): void {
  lastAppliedSkillsKey.delete(normalizeProjectRoot(projectPath));
}

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
        console.error("[skills-refresh] failed:", err);
      });
    }, SKILLS_REFRESH_DEBOUNCE_MS),
  );
}

export function scheduleSkillsRefreshFromPaths(
  projectRoot: string,
  paths: string[] | undefined,
): void {
  if (!paths?.length) return;
  const relevant = paths.filter((p) => isSkillsIntegrationPath(p, projectRoot));
  if (!relevant.length) return;
  if (relevant.every((p) => isSkillsManifestPath(p, projectRoot))) {
    return;
  }
  scheduleSkillsRefresh(projectRoot);
}

export function scheduleSkillsRefreshFromAgentPath(absPath: string): void {
  const projectRoot = projectRootFromAgentPath(absPath);
  if (!projectRoot || !isSkillsIntegrationPath(absPath, projectRoot)) return;
  scheduleSkillsRefresh(projectRoot);
}
