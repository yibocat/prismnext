/**
 * Project-scoped chat prewarm — syncs experts/skills/prompts and purges
 * leftover empty sessions.
 *
 * Industry model (ACP / Zed / Cline): warm the Agent process + project config
 * only. Conversations are created on first send via session/new.
 */
import { AcpService } from "../acp/service";
import { buildPromptContext } from "../prompts/context";
import { createLogger } from "./logger";
import {
  refreshProjectSubagentsIntegrationIfNeeded,
} from "./project-subagents-refresh";
import {
  refreshProjectSkillsIntegrationIfNeeded,
} from "./project-skills-refresh";
import { syncProjectPromptFile } from "./prompt-sync";
import { getAgentsSyncState } from "../teams/agents-sync";
import { normalizeProjectRoot } from "./skills-sync";
import type { ProjectWarmPhase } from "../../shared/agent-status";

const log = createLogger("project-chat-prewarm", "agent");

const inflight = new Map<string, Promise<void>>();
const readyProjects = new Set<string>();
const warmErrors = new Map<string, string>();

export function invalidateProjectChatPrewarm(projectRoot: string): void {
  const root = normalizeProjectRoot(projectRoot);
  readyProjects.delete(root);
  warmErrors.delete(root);
}

/** Project config warm phase for status UI (none | warming | ready | error). */
export function getProjectWarmPhase(projectRoot: string): ProjectWarmPhase {
  const root = normalizeProjectRoot(projectRoot);
  if (readyProjects.has(root)) return "ready";
  if (inflight.has(root)) return "warming";
  if (warmErrors.has(root)) return "error";
  return "none";
}

export function getProjectWarmError(projectRoot: string): string | null {
  return warmErrors.get(normalizeProjectRoot(projectRoot)) ?? null;
}

function emitWarmStatus(projectRoot: string): void {
  try {
    const { emitAgentStatusChanged } = require("./agent-status-notify") as {
      emitAgentStatusChanged: (s: unknown) => void;
    };
    emitAgentStatusChanged(AcpService.getInstanceForProject(projectRoot).getStatusSnapshot(projectRoot));
  } catch {
    /* windows may not be ready */
  }
}

export type ProjectChatPrewarmOptions = {
  /**
   * Sync experts/skills/prompts to disk but do not restart OpenCode.
   * Use when the caller will `ensureConnected` next and may credential-restart
   * — the new process already picks up files from disk.
   */
  skipOpenCodeReload?: boolean;
};

/**
 * Ensure project experts/skills/prompt files are synced before first chat send.
 * Safe to call repeatedly — no-ops when prewarm already finished.
 */
export async function ensureProjectChatPrewarm(
  projectRoot: string,
  options?: ProjectChatPrewarmOptions,
): Promise<void> {
  const root = normalizeProjectRoot(projectRoot);
  if (readyProjects.has(root)) return;

  let pending = inflight.get(root);
  if (!pending) {
    warmErrors.delete(root);
    pending = runProjectChatPrewarm(root, options)
      .then(() => {
        readyProjects.add(root);
        warmErrors.delete(root);
        emitWarmStatus(root);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        warmErrors.set(root, message);
        readyProjects.delete(root);
        emitWarmStatus(root);
        throw err;
      })
      .finally(() => {
        inflight.delete(root);
        emitWarmStatus(root);
      });
    inflight.set(root, pending);
    emitWarmStatus(root);
  }
  await pending;
}

async function runProjectChatPrewarm(
  projectRoot: string,
  options?: ProjectChatPrewarmOptions,
): Promise<void> {
  const t0 = Date.now();
  const acp = AcpService.getInstanceForProject(projectRoot);
  const skipReload = options?.skipOpenCodeReload === true;

  // Touch active-team resolution so teams.json migration/defaults are warm
  // before agents-sync; chat send uses the same resolver path.
  const { resolveChatOrchestrator } = await import("../teams/resolver");
  resolveChatOrchestrator(projectRoot);
  const promptCtx = await buildPromptContext(projectRoot);

  const prevExpertsState = getAgentsSyncState(projectRoot);
  const expertsResult = await refreshProjectSubagentsIntegrationIfNeeded(projectRoot, { promptCtx });
  const skillsResult = await refreshProjectSkillsIntegrationIfNeeded(projectRoot);

  syncProjectPromptFile(projectRoot, promptCtx);
  const { instructionsChanged } = acp.applyProjectPromptIntegration(projectRoot);

  const expertsHashChanged =
    !expertsResult.skipped
    && (
      !prevExpertsState?.orchestratorContentHash
      || prevExpertsState.orchestratorContentHash !== expertsResult.orchestratorContentHash
    );

  // Fresh OpenCode children already read agent/skill files from disk on
  // session/new. Reloading right after a credential/skills spawn doubles
  // first-send latency (~1s+) for no benefit. Same when credentials are about
  // to force a restart — let that single spawn pick up the synced files.
  const spawnedRecently = acp.wasSpawnedRecently();
  const credentialRestartPending =
    skipReload || acp.wouldRestartForCredentials();
  const configDirty =
    expertsHashChanged || skillsResult.configChanged || instructionsChanged;
  const needsReload =
    acp.getConnection()
    && !credentialRestartPending
    && !spawnedRecently
    && configDirty;

  if (needsReload) {
    log.info("Project chat prewarm — reloading OpenCode", {
      projectRoot,
      experts: expertsHashChanged,
      skills: skillsResult.configChanged,
      instructions: instructionsChanged,
    });
    await acp.reloadAfterSkillsIntegration();
  } else if (configDirty && (credentialRestartPending || spawnedRecently)) {
    log.info("Project chat prewarm — skip reload", {
      projectRoot,
      reason: spawnedRecently
        ? "just_spawned"
        : "deferred_to_credential_connect",
      experts: expertsHashChanged,
      skills: skillsResult.configChanged,
      instructions: instructionsChanged,
      spawnAgeMs: Date.now() - acp.getLastSpawnAtMs(),
    });
  }

  // Clear never-used empty sessions (no messages) for this project.
  if (acp.getConnection()) {
    try {
      await acp.purgeEmptySessions(projectRoot);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn("purgeEmptySessions during prewarm failed", { error: message });
    }
    void acp.refreshEffortCatalog().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.debug("refreshEffortCatalog during prewarm failed", { error: message });
    });
  }

  log.info("Project chat prewarm complete", {
    projectRoot,
    ms: Date.now() - t0,
    expertsSkipped: expertsResult.skipped,
    skillsSkipped: skillsResult.skipped,
    opencodeReloaded: needsReload,
  });
}
