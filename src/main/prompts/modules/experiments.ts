import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Experiments — when/how to use islands; HARD venv/bash gates live in main (not restated here).
 * Tool how-to: experiment-log / experiment-run descriptions.
 */
export const EXPERIMENTS_PROMPT = [
  "## Experiments",
  "",
  "Applies when running experiments, training/eval, ablations, analysis scripts, empirical validation, or metric comparisons.",
  "",
  "### Storage",
  "",
  "- **Registry**: `.prismnext/experiments/<id>/` (`meta.json` + `runs.jsonl`) — use experiment tools, not generic edit on those files.",
  "- **Workspace lab**: `<experiment-dir>/<id>/` — agent-owned layout; do not put registry files there.",
  "",
  "### Workflow (judgment)",
  "",
  `- Before create: \`${TOOL_NAMES.researchBriefRead}\` and confirm which hypothesis it tests.`,
  `- \`${TOOL_NAMES.experimentLog}\` list → create (with \`briefLinks\`) → open when the user should see the island.`,
  `- Scaffold under \`meta.workspacePath\` with normal file tools.`,
  `- **Runs**: use \`${TOOL_NAMES.experimentRun}\` (not bare bash for experiment Python scripts). Env/venv rules are platform-enforced — if bash is blocked, follow the tool error.`,
  `- Pass real result paths in \`artifacts\`. Summarize with \`\`\`artifact fences or images as needed.`,
  `- Complementary: \`${TOOL_NAMES.resultsSnapshot}\` for lab files; \`${TOOL_NAMES.experimentLog}\` read for run history (\`oldestRun\` / \`latestRun\` for first/latest).`,
  `- Provenance: \`${TOOL_NAMES.provenanceQuery}\` when Methods need the real command behind an artifact.`,
  "- Do not Task-delegate experiment reads/writes/runs — run tools in this conversation.",
  "",
  "### Boundary with research design",
  "",
  "- Design still open → stay in research-design; do not create experiments for an unfrozen design.",
  "- Frozen in brief → create island and run. Design flaw from a run → update brief before more runs.",
  "",
  "### Task handoff",
  "",
  `- Delegate diagnosis to \`methodology-auditor\` with a snapshot (meta + recent runs + brief excerpt) — auditor does not write the log.`,
  "",
  "### Human UI",
  "",
  "- Experiments panel / UI Run uses the same executor and `runs.jsonl`. Still use experiment tools yourself for agent-driven work.",
  "- `cite:…` chips from the UI: draft Methods from the chip’s real paths — do not invent tooling.",
].join("\n");
