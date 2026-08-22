/**
 * Project-scoped file prewarm — syncs experts/skills/prompts to disk.
 * Does not spawn or reload OpenCode.
 */
import { buildPromptContext } from "../prompts/context";
import { createLogger } from "../app/logger";
import {
  refreshProjectSubagentsIntegrationIfNeeded,
} from "./project-subagents-refresh";
import {
  refreshProjectSkillsIntegrationIfNeeded,
} from "./project-skills-refresh";
import { getAgentsSyncState } from "../teams/agents-sync";
import { normalizeProjectRoot } from "./skills-sync";
import type { ProjectWarmPhase } from "../../shared/agent/status";

const log = createLogger("project-chat-prewarm", "agent");

const inflight = new Map<string, Promise<void>>();
const readyProjects = new Set<string>();
const warmErrors = new Map<string, string>();

export function invalidateProjectChatPrewarm(projectRoot: string): void {
  const root = normalizeProjectRoot(projectRoot);
  readyProjects.delete(root);
  warmErrors.delete(root);
}

/** True when file-level prewarm finished successfully for this project. */
export function isProjectChatPrewarmReady(projectRoot: string): boolean {
  return readyProjects.has(normalizeProjectRoot(projectRoot));
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

export type ProjectChatPrewarmOptions = {
  /** @deprecated OpenCode reload is gone; kept so leftover callers still type-check. */
  skipOpenCodeReload?: boolean;
};

/**
 * Ensure project experts/skills/prompt files are synced before first chat send.
 * Safe to call repeatedly — no-ops when prewarm already finished.
 */
export async function ensureProjectChatPrewarm(
  projectRoot: string,
  _options?: ProjectChatPrewarmOptions,
): Promise<void> {
  const root = normalizeProjectRoot(projectRoot);
  if (readyProjects.has(root)) return;

  let pending = inflight.get(root);
  if (!pending) {
    warmErrors.delete(root);
    pending = runProjectChatPrewarm(root)
      .then(() => {
        readyProjects.add(root);
        warmErrors.delete(root);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        warmErrors.set(root, message);
        readyProjects.delete(root);
        throw err;
      })
      .finally(() => {
        inflight.delete(root);
      });
    inflight.set(root, pending);
  }
  await pending;
}

async function runProjectChatPrewarm(projectRoot: string): Promise<void> {
  const t0 = Date.now();

  const { resolveChatOrchestrator } = await import("../teams/resolver");
  resolveChatOrchestrator(projectRoot);
  const promptCtx = await buildPromptContext(projectRoot);

  const prevExpertsState = getAgentsSyncState(projectRoot);
  const expertsResult = await refreshProjectSubagentsIntegrationIfNeeded(projectRoot, { promptCtx });
  const skillsResult = await refreshProjectSkillsIntegrationIfNeeded(projectRoot);

  const expertsHashChanged =
    !expertsResult.skipped
    && (
      !prevExpertsState?.orchestratorContentHash
      || prevExpertsState.orchestratorContentHash !== expertsResult.orchestratorContentHash
    );

  log.info("Project chat prewarm complete", {
    projectRoot,
    ms: Date.now() - t0,
    expertsSkipped: expertsResult.skipped,
    skillsSkipped: skillsResult.skipped,
    expertsHashChanged,
    skillsChanged: skillsResult.configChanged,
  });
}
