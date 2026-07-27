import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Interaction — when to create Interactive Research Artifacts (judgment map only).
 * How-to (schema, samples, Python/bound recipes) lives in the interaction-write
 * tool description — see src/main/tools/interaction-write.ts (R2/R3: tool owns
 * "how", module owns "when").
 */
export const INTERACTION_PROMPT = [
  "## Interaction (interactive research objects)",
  "",
  "Applies when the user needs **adjustable** plots, figures, math scenes, or 3D manifolds — not plain file preview.",
  "",
  "### Which kind to use (pick the narrowest that fits)",
  "",
  "- **plot.*** — csv curves/scatter.",
  "- **figure.plotly** — default for scientific 2D/3D (surfaces, vector fields, heatmaps, step-through demos). Agent writes Plotly JSON; host renders.",
  "- **instrument** — like figure.plotly but with *live* recompute on binding change, or true step-by-step iteration (Newton/EM/BFS-style).",
  "- **figure.static** — figure.plotly vocabulary too narrow (LaTeX axes, multi-panel figures) → generate via Python; or an existing PNG/SVG/HTML.",
  "- **figure.script** — last resort when figure.plotly/instrument truly can't express it (molecule structures, custom geometry). Agent writes a real JS module executed in a locked-down sandbox; no live binding updates. Prefer figure.plotly/instrument for anything they can express.",
  `- **bound vs local** — after ${TOOL_NAMES.experimentRun} already produced a chart/table, bind to its real output instead of regenerating it.`,
  "- **scene.ir / math.surface / math.field / scene.program are retired** — read-only now (old artifacts show a migration card). Do not write these kinds; use figure.plotly/instrument.",
  "",
  "### Workflow",
  "",
  `- Discover: ${TOOL_NAMES.interactionList}. Update: ${TOOL_NAMES.interactionRead} (check lastError).`,
  `- ${TOOL_NAMES.interactionWrite} carries the schema, samples, and Python/bound recipes for each kind.`,
  "- Embed fenceMarkdown after success.",
  "",
  "### Do not",
  "",
  "- Build DOM/HUD in scripts — host owns UI.",
].join("\n");
