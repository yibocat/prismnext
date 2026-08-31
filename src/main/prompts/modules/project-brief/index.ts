/** Project brief
 * Segment: module
 * Answers: when to read/update `.brief.md` as the on-disk research spine
 * Not here: live research thinking (research-design); tool how-to
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { PROJECT_BRIEF_PROMPT } from "./prompt";

export { PROJECT_BRIEF_PROMPT };

export const PROJECT_BRIEF_MODULE: PromptModule = {
  key: "project-brief",
  label: "Project Brief (`.brief.md`)",
  description:
    "Intellectual spine at project-root `.brief.md` — thesis line, not memory, rules, or experiment plans.",
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: PROJECT_BRIEF_PROMPT,
};
