/** Research design
 * Segment: module
 * Answers: when to explore/pressure-test the research story (not run protocols)
 * Not here: `.brief.md` mechanics; experiment execution; Plan tool how-to
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { RESEARCH_DESIGN_PROMPT } from "./prompt";

export { RESEARCH_DESIGN_PROMPT };

export const RESEARCH_DESIGN_MODULE: PromptModule = {
  key: "research-design",
  label: "Research Design",
  description:
    "Scientific thinking and intellectual roadmap — explore, pressure-test, Plan/coach; not experiment design.",
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: RESEARCH_DESIGN_PROMPT,
};
