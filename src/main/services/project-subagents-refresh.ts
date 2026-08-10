import { BrowserWindow } from "electron";
import { AcpService } from "../acp/service";
import type { PromptContext } from "../prompts/types";
import {
  buildAgentsPlan,
  getAgentsSyncState,
  getOpencodeAgentsDir,
  syncAgentsToOpencode,
} from "../teams/agents-sync";
import {
  clearSyncedAgentFiles,
  readPrismExpertsSyncState,
} from "./subagents-sync";
import { invalidateProjectChatPrewarm } from "./project-chat-prewarm";
import { normalizeProjectRoot } from "./skills-sync";

const EXPERTS_REFRESH_DEBOUNCE_MS = 800;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const reloadPendingProjects = new Set<string>();

export function notifyExpertsIntegrationChanged(projectPath: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("subagents:integrationChanged", { projectPath });
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

/** Sync project agents to the app-level OpenCode agents dir (write only — no restart). */
export async function refreshProjectSubagentsIntegration(
  projectRoot: string,
  options?: RefreshProjectExpertsOptions,
): Promise<RefreshProjectExpertsResult> {
  const root = normalizeProjectRoot(projectRoot);
  const agentsDir = getOpencodeAgentsDir(root);
  // Clean up files recorded by the LEGACY on-disk sync state (pre-T3) on the
  // first switch; the new in-memory sync state handles staleness after that.
  const legacyPrev = readPrismExpertsSyncState();
  if (legacyPrev?.agentFiles?.length && !getAgentsSyncState(root)) {
    clearSyncedAgentFiles(agentsDir, legacyPrev.agentFiles);
  }
  const result = syncAgentsToOpencode(root, {
    agentsDir,
    promptCtx: options?.promptCtx,
  });
  notifyExpertsIntegrationChanged(root);
  return {
    agentFiles: result.agentFiles,
    orchestratorId: result.activeOrchestratorId,
    orchestratorContentHash: result.orchestratorContentHash,
    syncContentHash: result.syncContentHash,
    skipped: false,
  };
}

/**
 * Skip disk rewrite when agent.md payloads are unchanged — saves hundreds of ms on chat send.
 */
export async function refreshProjectSubagentsIntegrationIfNeeded(
  projectRoot: string,
  options?: RefreshProjectExpertsOptions,
): Promise<RefreshProjectExpertsResult> {
  const root = normalizeProjectRoot(projectRoot);
  const plan = buildAgentsPlan(projectRoot, options);
  const prev = getAgentsSyncState(root);

  if (prev && prev.syncContentHash && prev.syncContentHash === plan.syncContentHash) {
    return {
      agentFiles: prev.agentFiles,
      orchestratorId: prev.activeOrchestratorId,
      orchestratorContentHash: prev.orchestratorContentHash,
      syncContentHash: plan.syncContentHash,
      skipped: true,
    };
  }

  return refreshProjectSubagentsIntegration(projectRoot, options);
}

/** Sync experts then restart OpenCode when orchestrator agent.md content changed. */
export async function refreshProjectExpertsIntegrationWithReload(
  projectRoot: string,
  options?: RefreshProjectExpertsOptions,
): Promise<RefreshProjectExpertsResult> {
  const root = normalizeProjectRoot(projectRoot);
  const prev = getAgentsSyncState(root);
  const result = await refreshProjectSubagentsIntegrationIfNeeded(root, options);
  const hashChanged =
    !result.skipped
    && (
      !prev?.orchestratorContentHash
      || prev.orchestratorContentHash !== result.orchestratorContentHash
    );
  const acp = AcpService.getInstanceForProject(root);
  const needsReload = hashChanged || reloadPendingProjects.has(root);
  if (needsReload) {
    if (!acp.getConnection()) {
      reloadPendingProjects.add(root);
      return result;
    }
    try {
      await acp.reloadAfterExpertsIntegration();
      reloadPendingProjects.delete(root);
    } catch (err) {
      reloadPendingProjects.add(root);
      throw err;
    }
  }
  return result;
}

export function scheduleSubagentsRefresh(projectRoot: string): void {
  invalidateProjectChatPrewarm(projectRoot);
  const existing = pendingTimers.get(projectRoot);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    projectRoot,
    setTimeout(() => {
      pendingTimers.delete(projectRoot);
      void (async () => {
        try {
          await refreshProjectExpertsIntegrationWithReload(projectRoot);
        } catch (err: any) {
          // The pending reload marker guarantees the next prewarm retries.
          console.warn("[experts-refresh] deferred (will retry):", err?.message ?? err);
        }
        // session/load must not race the OpenCode restart above; otherwise an
        // in-flight MCP push can observe ACP connection closed.
        try {
          const { AcpService } = await import("../acp/service");
          await AcpService.getInstanceForProject(normalizeProjectRoot(projectRoot)).applyProjectMcpConfig(projectRoot);
        } catch (err: unknown) {
          console.warn(
            "[experts-refresh] MCP push deferred:",
            err instanceof Error ? err.message : String(err),
          );
        }
      })();
    }, EXPERTS_REFRESH_DEBOUNCE_MS),
  );
}

export function isExpertsIntegrationPath(absPath: string, projectRoot: string): boolean {
  const normalized = absPath.replace(/\\/g, "/");
  const root = projectRoot.replace(/\\/g, "/");
  return (
    // local pack（用户自建 orchestrators/experts/skills/commands）
    normalized.includes(`${root}/.prismnext/agent/local/`)
    || normalized.includes(`${root}/.prismnext/agent/teams/project.local/`)
    // project teams root + teams.json（v2 启停 / 默认活动团队）
    || normalized.includes(`${root}/.prismnext/agent/teams/`)
    || normalized.endsWith(`${root}/.prismnext/agent/teams.json`)
    // packs.json（legacy 启停 / override / 默认 orchestrator）
    || normalized.endsWith(`${root}/.prismnext/agent/packs.json`)
    // legacy 路径（迁移前/回滚期仍可能变动）
    || normalized.includes(`${root}/.prismnext/agent/experts/`)
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
  scheduleSubagentsRefresh(projectRoot);
}
