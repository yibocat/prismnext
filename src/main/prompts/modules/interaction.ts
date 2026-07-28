import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Interaction — when to create artifacts (judgment only).
 * Schema and samples: interaction-write tool description.
 */
export const INTERACTION_PROMPT = [
  "## Interaction",
  "",
  "Create a persistent Interaction only when the user needs an interactive research object, not a normal file preview.",
  "",
  "### Decide before writing",
  "",
  "Identify the data source, time behavior, and rendering capability required. " +
    "The `interaction-write` tool defines the available runtimes and their constraints.",
  `Existing ${TOOL_NAMES.experimentRun} output is a real resource: reference it; do not regenerate or invent data.`,
  "",
  "### Workflow",
  "",
  `${TOOL_NAMES.interactionWrite} → on failure read \`error\` and fix that (same kind). Success → fenceMarkdown.`,
].join("\n");
