/**
 * Canonical OpenCode tool names for prismnext built-in tools.
 * Single source for prompt strings — do not hardcode tool names elsewhere.
 */
export const TOOL_NAMES = {
  question: "question",
  bash: "bash",
  delete: "delete",
  move: "move",
  literatureSearch: "literature-search",
  literatureDiscover: "literature-discover",
  literatureStage: "literature-stage",
  literatureAdd: "literature-add",
  literatureRead: "literature-read",
  literatureReadPdf: "literature-read-pdf",
  literatureIntensiveReading: "literature-intensive-reading",
  literatureExportBib: "literature-export-bib",
  literatureDelete: "literature-delete",
  citationHealth: "citation-health",
  latexRoot: "latex-root",
  latexCompile: "latex-compile",
  researchBriefRead: "research-brief-read",
  researchBriefUpdate: "research-brief-update",
  projectRuleWrite: "project-rule-write",
  suggestPlan: "suggest-plan",
  experimentLog: "experiment-log",
  experimentRun: "experiment-run",
  resultsSnapshot: "results-snapshot",
  provenanceQuery: "provenance-query",
  interactionList: "interaction-list",
  interactionRead: "interaction-read",
  interactionWrite: "interaction-write",
  interactionOpen: "interaction-open",
} as const;

export type ToolNameKey = keyof typeof TOOL_NAMES;
export type ToolName = (typeof TOOL_NAMES)[ToolNameKey];

/** All registered prismnext custom tool names (values of TOOL_NAMES). */
export const ALL_TOOL_NAMES = Object.values(TOOL_NAMES);
