/** Literature library
 * Segment: module
 * Answers: when to search/read/cite papers already in the project library
 * Not here: external [n] staging; tool how-to
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { LITERATURE_LIBRARY_PROMPT } from "./prompt";

export { LITERATURE_LIBRARY_PROMPT };

export const LITERATURE_LIBRARY_MODULE: PromptModule = {
  key: "literature-library",
  label: "Literature Library (tags & search)",
  description:
    "Project library papers: search/read in the current project library, cite as [@bibkey]. External papers use Chat Paper Citations.",
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: LITERATURE_LIBRARY_PROMPT,
};
