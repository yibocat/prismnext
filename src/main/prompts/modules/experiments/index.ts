/** Experiments
 * Segment: module
 * Answers: when to create islands, run, snapshot, and query provenance
 * Not here: experiment tool how-to; research-story thinking
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { EXPERIMENTS_PROMPT } from "./prompt";

export { EXPERIMENTS_PROMPT };

export const EXPERIMENTS_MODULE: PromptModule = {
  key: "experiments",
  label: "Experiments (log & runs)",
  description:
    "Experiment islands under the Workspace Experiment folder — create/read, run+log discipline, methodology-auditor handoff.",
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: EXPERIMENTS_PROMPT,
};
