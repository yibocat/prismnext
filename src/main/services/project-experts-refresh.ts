import { BrowserWindow } from "electron";
import { AcpService } from "../acp/service";
import {
  clearSyncedAgentFiles,
  getOpencodeAgentsDir,
  readPrismExpertsSyncState,
  syncProjectExpertsToOpencode,
} from "./experts-sync";

const EXPERTS_REFRESH_DEBOUNCE_MS = 800;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function notifyExpertsIntegrationChanged(projectPath: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("experts:integrationChanged", { projectPath });
    }
  }
}

/** Sync project experts to app-level OpenCode agents directory. */
export async function refreshProjectExpertsIntegration(
  projectRoot: string,
): Promise<{ agentFiles: string[]; orchestratorId: string }> {
  const agentsDir = getOpencodeAgentsDir();
  const prev = readPrismExpertsSyncState();
  if (prev?.agentFiles?.length) {
    clearSyncedAgentFiles(agentsDir, prev.agentFiles);
  }
  const result = syncProjectExpertsToOpencode(projectRoot, { agentsDir });
  notifyExpertsIntegrationChanged(projectRoot);
  return result;
}

/** Sync experts then restart OpenCode so new agent definitions are loaded. */
export async function refreshProjectExpertsIntegrationWithReload(
  projectRoot: string,
): Promise<{ agentFiles: string[]; orchestratorId: string }> {
  const result = await refreshProjectExpertsIntegration(projectRoot);
  const acp = AcpService.getInstance();
  if (acp.getConnection()) {
    await acp.reloadAfterExpertsIntegration();
  }
  return result;
}

export function scheduleExpertsRefresh(projectRoot: string): void {
  const existing = pendingTimers.get(projectRoot);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    projectRoot,
    setTimeout(() => {
      pendingTimers.delete(projectRoot);
      void refreshProjectExpertsIntegrationWithReload(projectRoot).catch((err) => {
        console.error("[experts-refresh] failed:", err);
      });
    }, EXPERTS_REFRESH_DEBOUNCE_MS),
  );
}

export function isExpertsIntegrationPath(absPath: string, projectRoot: string): boolean {
  const normalized = absPath.replace(/\\/g, "/");
  const root = projectRoot.replace(/\\/g, "/");
  return (
    normalized.includes(`${root}/.prismnext/agent/experts/`)
    || normalized.endsWith(`${root}/.prismnext/agent/experts-manifest.json`)
    || normalized.endsWith(`${root}/.prismnext/agent/orchestrators-manifest.json`)
  );
}

export function scheduleExpertsRefreshFromPaths(
  projectRoot: string,
  paths: string[] | undefined,
): void {
  if (!paths?.length) return;
  if (!paths.some((p) => isExpertsIntegrationPath(p, projectRoot))) return;
  scheduleExpertsRefresh(projectRoot);
}
