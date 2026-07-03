import { BrowserWindow } from "electron";
import {
  isSkillsIntegrationPath,
  isSkillsManifestPath,
  projectRootFromAgentPath,
  syncProjectSkillsIntegration,
} from "./skills-sync";
import { AcpService } from "../acp/service";

const SKILLS_REFRESH_DEBOUNCE_MS = 800;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function notifySkillsIntegrationChanged(projectPath: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("skills:integrationChanged", { projectPath });
    }
  }
}

/** Sync project skills on disk + app-level OpenCode config + agent config cache. */
export async function refreshProjectSkillsIntegration(
  projectPath: string,
  options?: { profileSkillAllowlist?: string[] },
): Promise<ReturnType<typeof syncProjectSkillsIntegration> & { configPath: string }> {
  const result = syncProjectSkillsIntegration(projectPath, options);
  const acp = AcpService.getInstance();
  const configPath = acp.applyProjectSkillsIntegration(projectPath, {
    skillsPaths: result.skillsPaths,
    skillPermissions: result.skillPermissions,
  });
  acp.prewarmProject(projectPath);
  notifySkillsIntegrationChanged(projectPath);
  return { ...result, configPath };
}

/** Skills file changed on disk — sync then restart OpenCode so config is loaded. */
export async function refreshProjectSkillsIntegrationWithReload(
  projectPath: string,
  options?: { profileSkillAllowlist?: string[] },
): Promise<ReturnType<typeof refreshProjectSkillsIntegration>> {
  const result = await refreshProjectSkillsIntegration(projectPath, options);
  const acp = AcpService.getInstance();
  if (acp.getConnection()) {
    await acp.reloadAfterSkillsIntegration();
  }
  return result;
}

export function scheduleSkillsRefresh(projectPath: string): void {
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
  // Manifest-only edits (enable/disable toggles) are synced by agent:setSkillEnabled IPC.
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
