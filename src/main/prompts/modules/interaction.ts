import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Interaction — when/how to create Interactive Research Artifacts.
 * Tool how-to: interaction-list / interaction-read / interaction-write / interaction-open descriptions.
 */
export const INTERACTION_PROMPT = [
  "## Interaction (interactive research objects)",
  "",
  "Applies when the user needs **adjustable** plots, loss landscapes, or interactive views of data — not plain file preview.",
  "",
  "### vs file artifact fence",
  "",
  "- **Result files** (png/csv/pdf paths) → artifact fence with path: (see Reply depth).",
  "- **Persistent interactive objects** (spec on disk) → interaction-* tools, then an **interaction** fence (id: …) in your **assistant** reply.",
  "",
  "### vs experiments",
  "",
  "- experiment-run = real execution + runs.jsonl.",
  "- **bound** interaction = read-only interactive instrument over run outputs (csv in resources[]).",
  "- **local** interaction = sketch/simulation without a run (math.surface, demo plot.line).",
  "",
  "### Workflow (judgment)",
  "",
  `- Discover: ${TOOL_NAMES.interactionList} (optional kindPrefix).`,
  `- Update: ${TOOL_NAMES.interactionRead} first, then ${TOOL_NAMES.interactionWrite} with full spec JSON.`,
  `- Create: ${TOOL_NAMES.interactionWrite} → embed returned fenceMarkdown in your assistant message.`,
  `- Open panel: ${TOOL_NAMES.interactionOpen} when the user asks to show it in RightArea (card in chat still helps).`,
  `- After ${TOOL_NAMES.experimentRun} with metrics csv → bound plot.* + resources[] is often better than only an artifact fence.`,
  "",
  "### Do not",
  "",
  "- Grep/read the project hunting for interaction ids — use interaction-list/read.",
  "- Use generic read/write/edit on .prismnext/artifacts/<id>/spec.json.",
  "- Use artifact fences for interactive objects.",
].join("\n");
