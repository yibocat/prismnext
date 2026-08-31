/** Interaction
 * Segment: module
 * Answers: when to persist a revisitable figure/plot vs a one-shot artifact peek
 * Not here: spec field manuals (interaction-write); vision how-to
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { INTERACTION_PROMPT } from "./prompt";

export { INTERACTION_PROMPT };

export const INTERACTION_MODULE: PromptModule = {
  key: "interaction",
  label: "Interaction (figures & plots)",
  description:
    "Persisted figures/plots as clickable chat cards — when to use interaction-* vs ```artifact.",
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: INTERACTION_PROMPT,
};
