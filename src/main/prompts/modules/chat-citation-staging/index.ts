/** Chat paper citations
 * Segment: module
 * Answers: when to discover/stage external papers and cite as [n]
 * Not here: library [@bibkey] (literature-library); tool how-to
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { TOOL_NAMES } from "../../../../shared/agent/tool-names";
import { CHAT_CITATION_STAGING_PROMPT } from "./prompt";

export { CHAT_CITATION_STAGING_PROMPT };

export const CHAT_CITATION_STAGING_MODULE: PromptModule = {
  key: "chat-citation-staging",
  label: "Chat Paper Citations",
  description:
    `External papers in chat: ${TOOL_NAMES.literatureStage} first, cite as [n]. Library papers use the Literature Library module.`,
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: CHAT_CITATION_STAGING_PROMPT,
};
