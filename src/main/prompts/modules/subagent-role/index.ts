/** Subagent role
 * Segment: module (expert-only)
 * Answers: how a Task specialist scopes, grounds, and returns a deliverable
 * Not here: orchestrator scheduling; nested Task
 * Settings: bundled with experts (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { SUBAGENT_ROLE_PROMPT } from "./prompt";

export { SUBAGENT_ROLE_PROMPT };

export const SUBAGENT_ROLE_MODULE: PromptModule = {
  key: "subagent-role",
  label: "Subagent Role (experts)",
  description:
    "Expert/subagent only: follow role instructions first; focused Task deliverable; not for the primary orchestrator.",
  enabled: true,
  profileOnly: true,
  expertOnly: true,
  source: "app",
  prompt: SUBAGENT_ROLE_PROMPT,
};
