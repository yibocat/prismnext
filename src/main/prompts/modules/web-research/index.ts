/** Web research (docs, tools & data)
 * Segment: module
 * Answers: when to search/fetch the public web for non-library, non-manuscript content
 * Not here: library [@bibkey]; external [n] staging how-to
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { TOOL_NAMES } from "../../../../shared/agent/tool-names";
import { WEB_RESEARCH_PROMPT } from "./prompt";

export { WEB_RESEARCH_PROMPT };

export const WEB_RESEARCH_MODULE: PromptModule = {
  key: "web-research",
  label: "Web Research (docs, tools & data)",
  description:
    `Public web lookup via ${TOOL_NAMES.websearch} / ${TOOL_NAMES.webfetch}: docs, packages, datasets, and tool sites. Papers use Literature / Chat paper citations modules.`,
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: WEB_RESEARCH_PROMPT,
};
