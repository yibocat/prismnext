import { getHostEvents } from "../app/event-sink";
import type { PromptContext } from "../prompts/types";
import {
  buildAgentsPlan,
  getAgentsSyncState,
  syncAgentsToOpencode,
} from "../teams/agents-sync";
import { invalidateProjectChatPrewarm } from "./project-chat-prewarm";
import { normalizeProjectRoot } from "./skills-sync";
import { PROJECT_META_DIR, projectTeamsRel } from "../../shared/workbench/paths";

const EXPERTS_REFRESH_DEBOUNCE_MS = 800;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function notifyExpertsIntegrationChanged(projectPath: string): void {
  getHostEvents().broadcast("subagents:integrationChanged", { projectPath });
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

/** Rebuild the in-memory agent plan (no OpenCode leftover writes). */
export async function refreshProjectSubagentsIntegration(
  projectRoot: string,
  options?: RefreshProjectExpertsOptions,
): Promise<RefreshProjectExpertsResult> {
  const root = normalizeProjectRoot(projectRoot);
  const result = syncAgentsToOpencode(root, {
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
          await refreshProjectSubagentsIntegrationIfNeeded(projectRoot);
        } catch (err: any) {
          console.warn("[experts-refresh] deferred (will retry):", err?.message ?? err);
        }
      })();
    }, EXPERTS_REFRESH_DEBOUNCE_MS),
  );
}

export function isExpertsIntegrationPath(absPath: string, projectRoot: string): boolean {
  const normalized = absPath.replace(/\\/g, "/");
  const root = projectRoot.replace(/\\/g, "/");
  return (
    normalized.includes(`${root}/${projectTeamsRel()}/`)
    || normalized.endsWith(`${root}/${PROJECT_META_DIR}/agent/teams.json`)
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
