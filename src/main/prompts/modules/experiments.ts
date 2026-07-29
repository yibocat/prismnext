import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Experiments — soft workflow for islands, runs, and results.
 * Venv/bash gates and run logging live in main; tool how-to on experiment-* tools.
 */
export const EXPERIMENTS_PROMPT = [
  "## Experiments",
  "",
  "Empirical work: training, eval, ablations, analysis scripts, metric comparisons.",
  "",
  "### Concept",
  "",
  "- **Registry** (`.prismnext/experiments/<id>/`) — metadata and run log via experiment tools.",
  "- **Workspace lab** (`meta.workspacePath`) — scripts, data, outputs the agent owns.",
  "",
  "### Soft workflow",
  "",
  `- Ground in the brief: \`${TOOL_NAMES.researchBriefRead}\` — which hypothesis does this test?`,
  `- \`${TOOL_NAMES.experimentLog}\` list → create → scaffold under the workspace path.`,
  `- **Runs**: \`${TOOL_NAMES.experimentRun}\` — pass real artifact paths; summarize with \`\`\`artifact fences.`,
  `- **Reopenable figures/plots** in the panel: \`${TOOL_NAMES.interactionWrite}\` — see Interaction module.`,
  `- Lab snapshots / run history: \`${TOOL_NAMES.resultsSnapshot}\`, \`${TOOL_NAMES.experimentLog}\` read (\`oldestRun\` / \`latestRun\`).`,
  `- Methods / provenance: \`${TOOL_NAMES.provenanceQuery}\` when you need the command behind a file.`,
  "",
  "### Boundary with research design",
  "",
  "- Design still open → stay in research-design. Frozen in brief → create and run.",
  "- Design flaw from a run → update the brief before more runs.",
  "",
  "### Task handoff",
  "",
  "- Delegate diagnosis to `methodology-auditor` with meta + recent runs + brief excerpt.",
  "- Run experiment tools in this conversation for reads/writes/runs unless the user asks to delegate.",
  "",
  "### Judgment",
  "",
  "- Experiments panel UI and agent tools share the same executor and `runs.jsonl`.",
  "- Project rules may define folder layout, naming, or run discipline — defer to them.",
].join("\n");
