/** Orchestrator judgment
 * Segment: module (orchestrator-only)
 * Answers: when to handle directly vs Task, how to schedule and synthesize
 * Not here: Task tool mechanics; expert behavior (subagent-role)
 * Settings: bundled with orchestrator (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { buildOrchestratorJudgmentPrompt } from "./build";

export { buildOrchestratorJudgmentPrompt };
export { ORCHESTRATOR_JUDGMENT_PROMPT } from "./build";

export const ORCHESTRATOR_JUDGMENT_MODULE: PromptModule = {
  key: "orchestrator-judgment",
  label: "Orchestrator Judgment",
  description:
    "Proactive scheduling + Task delegation — read the request, engage domains, delegate, synthesize.",
  enabled: true,
  profileOnly: true,
  orchestratorOnly: true,
  source: "app",
  build: buildOrchestratorJudgmentPrompt,
};
