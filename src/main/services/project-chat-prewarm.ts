/**
 * Project-scoped chat prewarm — runs on project open so the first chat:send
 * skips heavy experts/skills sync and OpenCode reload when already warm.
 */
import { AcpService } from "../acp/service";
import { buildPromptContext } from "../prompts/context";
import { createLogger } from "./logger";
import {
  refreshProjectExpertsIntegrationIfNeeded,
} from "./project-experts-refresh";
import {
  refreshProjectSkillsIntegrationIfNeeded,
} from "./project-skills-refresh";
import { syncProjectPromptFile } from "./prompt-sync";
import { readPrismExpertsSyncState } from "./experts-sync";
import { normalizeProjectRoot } from "./skills-sync";

const log = createLogger("project-chat-prewarm", "agent");

const inflight = new Map<string, Promise<void>>();
const readyProjects = new Set<string>();

export function invalidateProjectChatPrewarm(projectRoot: string): void {
  readyProjects.delete(normalizeProjectRoot(projectRoot));
}

/** True when this project completed prewarm in this app session. */
export function isProjectChatPrewarmReady(projectRoot: string): boolean {
  return readyProjects.has(normalizeProjectRoot(projectRoot));
}

/**
 * Ensure project experts/skills/prompt files are synced before first chat send.
 * Safe to call on every send — no-ops when prewarm already finished.
 */
export async function ensureProjectChatPrewarm(projectRoot: string): Promise<void> {
  const root = normalizeProjectRoot(projectRoot);
  if (readyProjects.has(root)) return;

  let pending = inflight.get(root);
  if (!pending) {
    pending = runProjectChatPrewarm(root).finally(() => {
      inflight.delete(root);
      readyProjects.add(root);
    });
    inflight.set(root, pending);
  }
  await pending;
}

async function runProjectChatPrewarm(projectRoot: string): Promise<void> {
  const t0 = Date.now();
  const acp = AcpService.getInstance();

  const {
    resolveOrchestratorId,
    getOrchestratorRuntimeFilters,
  } = await import("./experts-sync");

  const orchestratorId = resolveOrchestratorId(projectRoot, null);
  const ruleAllowlist = getOrchestratorRuntimeFilters(projectRoot, orchestratorId)?.rules;
  const promptCtx = await buildPromptContext(projectRoot, { ruleAllowlist });

  const prevExpertsState = readPrismExpertsSyncState();
  const expertsResult = await refreshProjectExpertsIntegrationIfNeeded(projectRoot, { promptCtx });
  const skillsResult = await refreshProjectSkillsIntegrationIfNeeded(projectRoot);

  syncProjectPromptFile(projectRoot, promptCtx);
  const { instructionsChanged } = acp.applyProjectPromptIntegration(projectRoot);

  const expertsHashChanged =
    !expertsResult.skipped
    && (
      !prevExpertsState?.orchestratorContentHash
      || prevExpertsState.orchestratorContentHash !== expertsResult.orchestratorContentHash
    );

  const needsReload =
    acp.getConnection()
    && (expertsHashChanged || skillsResult.configChanged || instructionsChanged);

  if (needsReload) {
    log.info("Project chat prewarm — reloading OpenCode", {
      projectRoot,
      experts: expertsHashChanged,
      skills: skillsResult.configChanged,
      instructions: instructionsChanged,
    });
    await acp.reloadAfterSkillsIntegration();
  }

  log.info("Project chat prewarm complete", {
    projectRoot,
    ms: Date.now() - t0,
    expertsSkipped: expertsResult.skipped,
    skillsSkipped: skillsResult.skipped,
    opencodeReloaded: needsReload,
  });
}
