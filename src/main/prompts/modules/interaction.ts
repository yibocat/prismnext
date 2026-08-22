/**
 * Interaction — when to create persisted figure/plot objects for chat.
 *
 * Spec/kind validation and path checks live in main; args/examples on interaction-* tools.
 * Chat one-shot file peeks use ```artifact (Reply depth) — not this module.
 */
import { TOOL_NAMES } from "../../../shared/agent/tool-names";

export const INTERACTION_PROMPT = [
  "## Interaction (figures & plots)",
  "",
  "An **Interaction** is a project-persisted research object: a static figure or a CSV-backed",
  "plot under `.workbench/interactions/<id>/`. After write, embed the tool's `fenceMarkdown`",
  "(`interaction` fence with `id`) in your reply so the user gets a **clickable card** and can",
  "reopen the same view later.",
  "",
  "Not a live sandbox. Not a one-shot file peek — that is an `artifact` fence (path only; see Reply depth).",
  "",
  "### When this applies",
  "",
  "- A figure/plot should be **revisited** or compared later — not only glanced at once.",
  "- After analysis writes a figure or a metrics CSV that deserves a durable view.",
  "",
  "### Route",
  "",
  "1. **One-shot path peek?** → `artifact` fence (Reply depth). Stop.",
  "2. **Reopenable figure or CSV plot?** → file must **already exist** on disk,",
  `   then \`${TOOL_NAMES.interactionWrite}\` (params on the tool). Embed returned \`fenceMarkdown\` in the reply.`,
  `3. **Update / re-embed?** → \`${TOOL_NAMES.interactionList}\` / \`${TOOL_NAMES.interactionRead}\`, then write if needed.`,
  `4. **User asks to open it now?** → \`${TOOL_NAMES.interactionOpen}\`. Otherwise the chat card is enough.`,
  "",
  "### Kind judgment",
  "",
  "- **`figure.static`** — a finished file on disk (PDF, PNG, SVG, …).",
  "- **`plot.line` / `plot.series` / `plot.scatter` / `plot.area`** — real CSV + x/y (or series); do not invent series.",
  "- **`plot.bar`** — categorical x + numeric y (multi-y stacks); **`plot.histogram`** — one numeric column (+ `bins`);",
  "  **`plot.box`** — group column x + one numeric y; **`plot.density`** — numeric x/y density contours;",
  "  **`plot.heatmap`** — x/y + `params.fill` value column (matrix views).",
  "",
  "### Judgment",
  "",
  "- Prefer Interaction when you may return to the view; prefer `artifact` for a quick peek.",
  "- A compiled PDF is already a chat preview. Do not convert it via bash just to look at it.",
  "- Need pixels and this chat model cannot view images →",
  `  \`${TOOL_NAMES.imageDescribe}\`. If the model can see images, \`read\` the PNG/JPG instead.`,
  "- Tool how-to stays on the tools; project rules may tighten naming — defer to them.",
].join("\n");
