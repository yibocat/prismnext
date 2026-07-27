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
  "- **instrument** — like figure.plotly but with *live* recompute on binding change, or true step-by-step iteration (Newton/EM/BFS-style). Prefer over scene.ir/math.* for new parametric work.",
  "- **math.surface / math.field** — simple explicit `z=f(u,v)` or planar vector fields only.",
  "- **scene.ir** — legacy declarative 3D (parametric surface + metric probe). Prefer figure.plotly for new work.",
  "- **figure.static** — scene.ir/figure.plotly vocabulary too narrow (LaTeX axes, multi-panel figures) → generate via Python; or an existing PNG/SVG/HTML.",
  "- **scene.program** — legacy; only `builtin:lorenz` still runs. Do **not** write new scene.js.",
  `- **bound vs local** — after ${TOOL_NAMES.experimentRun} already produced a chart/table, bind to its real output instead of regenerating it.`,
  "",
  "### Workflow",
  "",
  `- Discover: ${TOOL_NAMES.interactionList}. Update: ${TOOL_NAMES.interactionRead} (check lastError).`,
  `- ${TOOL_NAMES.interactionWrite} carries the schema, samples, and Python/bound recipes for each kind.`,
  "- Embed fenceMarkdown after success.",
  "",
  "### Do not",
  "",
  "- Pass sceneSource for scene.program, scene.ir, figure.plotly, or instrument (rejected) — they use spec.model instead.",
  "- Build DOM/HUD in scripts — host owns UI.",
].join("\n");
