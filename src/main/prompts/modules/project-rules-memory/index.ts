/** Project rules memory
 * Segment: module
 * Answers: when to persist standing preferences into project RULE.md files
 * Not here: tool how-to (project-rule-write); injected rule text (per-turn)
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { PROJECT_RULES_MEMORY_PROMPT } from "./prompt";

export { PROJECT_RULES_MEMORY_PROMPT };

export const PROJECT_RULES_MEMORY_MODULE: PromptModule = {
  key: "project-rules-memory",
  label: "Project Rules (remember)",
  description:
    "When to persist stable preferences into Settings project rules via project-rule-write.",
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: PROJECT_RULES_MEMORY_PROMPT,
};
