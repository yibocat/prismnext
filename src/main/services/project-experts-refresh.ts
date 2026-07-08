import { BrowserWindow } from "electron";
import { AcpService } from "../acp/service";
import type { PromptContext } from "../prompts/types";
import {
  buildProjectExpertsAgentPlan,
  clearSyncedAgentFiles,
  getOpencodeAgentsDir,
  readPrismExpertsSyncState,
  syncProjectExpertsToOpencode,
} from "./experts-sync";
import { invalidateProjectChatPrewarm } from "./project-chat-prewarm";
import { normalizeProjectRoot } from "./skills-sync";

const EXPERTS_REFRESH_DEBOUNCE_MS = 800;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function notifyExpertsIntegrationChanged(projectPath: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("experts:integrationChanged", { projectPath });
    }
  }
}

export interface RefreshProjectExpertsOptions {
  /** Workspace dirs and rules context for profile module builds (latex-workspace, etc.). */
  promptCtx?: PromptContext;
}

export interface RefreshProjectExpertsResult {
  agentFiles: string[];
  orchestratorId: string;
  orchestratorContentHash: string;
  syncContentHash: string;
  skipped: boolean;
}

/** Sync project experts to app-level OpenCode agents directory (write only — no OpenCode restart). */
export async function refreshProjectExpertsIntegration(
  projectRoot: string,
  options?: RefreshProjectExpertsOptions,
): Promise<RefreshProjectExpertsResult> {
  const agentsDir = getOpencodeAgentsDir();
  const prev = readPrismExpertsSyncState();
  if (prev?.agentFiles?.length) {
    clearSyncedAgentFiles(agentsDir, prev.agentFiles);
  }
  const result = syncProjectExpertsToOpencode(projectRoot, {
    agentsDir,
    promptCtx: options?.promptCtx,
  });
  notifyExpertsIntegrationChanged(projectRoot);
  return { ...result, skipped: false };
}

/**
 * Skip disk rewrite when agent.md payloads are unchanged — saves hundreds of ms on chat send.
 */
export async function refreshProjectExpertsIntegrationIfNeeded(
  projectRoot: string,
  options?: RefreshProjectExpertsOptions,
): Promise<RefreshProjectExpertsResult> {
  const root = normalizeProjectRoot(projectRoot);
  const plan = buildProjectExpertsAgentPlan(projectRoot, options);
  const prev = readPrismExpertsSyncState();

  if (
    prev?.projectRoot
    && normalizeProjectRoot(prev.projectRoot) === root
    && prev.syncContentHash
    && prev.syncContentHash === plan.syncContentHash
  ) {
    return {
      agentFiles: prev.agentFiles,
      orchestratorId: prev.orchestratorId,
      orchestratorContentHash: prev.orchestratorContentHash ?? plan.orchestratorContentHash,
      syncContentHash: plan.syncContentHash,
      skipped: true,
    };
  }

  return refreshProjectExpertsIntegration(projectRoot, options);
}

/** Sync experts then restart OpenCode when orchestrator agent.md content changed. */
export async function refreshProjectExpertsIntegrationWithReload(
  projectRoot: string,
  options?: RefreshProjectExpertsOptions,
): Promise<RefreshProjectExpertsResult> {
  const prev = readPrismExpertsSyncState();
  const result = await refreshProjectExpertsIntegrationIfNeeded(projectRoot, options);
  const hashChanged =
    !result.skipped
    && (
      !prev?.orchestratorContentHash
      || prev.orchestratorContentHash !== result.orchestratorContentHash
    );
  const acp = AcpService.getInstance();
  if (hashChanged && acp.getConnection()) {
    await acp.reloadAfterExpertsIntegration();
  }
  return result;
}

export function scheduleExpertsRefresh(projectRoot: string): void {
  invalidateProjectChatPrewarm(projectRoot);
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
