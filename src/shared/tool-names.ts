/**
 * Canonical OpenCode tool names for Prism built-in tools.
 * Single source for prompt strings — do not hardcode tool names elsewhere.
 */
export const TOOL_NAMES = {
  question: "question",
  bash: "bash",
  delete: "delete",
  move: "move",
  literatureSearch: "literature-search",
  literatureStage: "literature-stage",
  literatureAdd: "literature-add",
  literatureRead: "literature-read",
  literatureReadPdf: "literature-read-pdf",
  literatureExportBib: "literature-export-bib",
  literatureDelete: "literature-delete",
  citationHealth: "citation-health",
  latexRoot: "latex-root",
  latexCompile: "latex-compile",
  researchBriefRead: "research-brief-read",
  researchBriefUpdate: "research-brief-update",
  experimentLog: "experiment-log",
  experimentRun: "experiment-run",
  provenanceQuery: "provenance-query",
} as const;

export type ToolNameKey = keyof typeof TOOL_NAMES;
export type ToolName = (typeof TOOL_NAMES)[ToolNameKey];

/** All registered Prism custom tool names (values of TOOL_NAMES). */
export const ALL_TOOL_NAMES = Object.values(TOOL_NAMES);
