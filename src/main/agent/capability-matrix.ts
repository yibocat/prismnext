/**
 * Tool ownership for the Pi host.
 * Pi primitives stay Pi's. Host research / interactive tools are customTools.
 */

import { TOOL_NAMES } from "../../shared/agent/tool-names";

export type ToolCapabilityKind =
  | "pi_primitive"
  | "host_research"
  | "host_interactive";

export interface ToolCapability {
  name: string;
  kind: ToolCapabilityKind;
  notes: string;
}

export const PI_PRIMITIVE_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
] as const;

export type PiPrimitiveToolName = (typeof PI_PRIMITIVE_TOOL_NAMES)[number];

export function isPiPrimitiveToolName(name: string): name is PiPrimitiveToolName {
  return (PI_PRIMITIVE_TOOL_NAMES as readonly string[]).includes(name);
}

export const PI_PRIMITIVE_TOOLS: readonly ToolCapability[] = [
  { name: "read", kind: "pi_primitive", notes: "Pi createReadTool; PermissionGate wraps execute" },
  { name: "bash", kind: "pi_primitive", notes: "Pi createBashTool; hard-deny + Ask wrap execute" },
  { name: "edit", kind: "pi_primitive", notes: "Pi createEditTool; PermissionGate wraps execute" },
  { name: "write", kind: "pi_primitive", notes: "Pi createWriteTool; PermissionGate wraps execute" },
  { name: "grep", kind: "pi_primitive", notes: "Pi createGrepTool" },
  { name: "find", kind: "pi_primitive", notes: "Pi createFindTool" },
  { name: "ls", kind: "pi_primitive", notes: "Pi createLsTool" },
];

export const HOST_RESEARCH_TOOLS: readonly ToolCapability[] = [
  { name: TOOL_NAMES.literatureSearch, kind: "host_research", notes: "literature-service.searchPapers" },
  { name: TOOL_NAMES.literatureDiscover, kind: "host_research", notes: "literature-discovery.discoverLiterature" },
  { name: TOOL_NAMES.literatureStage, kind: "host_research", notes: "literature-citation-staging" },
  { name: TOOL_NAMES.literatureAdd, kind: "host_research", notes: "literature-service create/enrich" },
  { name: TOOL_NAMES.literatureDelete, kind: "host_research", notes: "literature-service delete" },
  { name: TOOL_NAMES.literatureRead, kind: "host_research", notes: "literature-service + extracts" },
  { name: TOOL_NAMES.literatureReadPdf, kind: "host_research", notes: "literature-pdf-resolve" },
  { name: TOOL_NAMES.literatureIntensiveReading, kind: "host_research", notes: "literature intensive pipeline" },
  { name: TOOL_NAMES.citationHealth, kind: "host_research", notes: "citation health service" },
  { name: TOOL_NAMES.literatureExportBib, kind: "host_research", notes: "bibliography export" },
  { name: TOOL_NAMES.latexRoot, kind: "host_research", notes: "latex-service root resolve" },
  { name: TOOL_NAMES.latexCompile, kind: "host_research", notes: "compiler.ts under .workbench/compile" },
  { name: TOOL_NAMES.latexCompileStandalone, kind: "host_research", notes: "compiler.ts in-place standalone figure" },
  { name: TOOL_NAMES.researchBriefRead, kind: "host_research", notes: "research-brief-service.read" },
  { name: TOOL_NAMES.researchBriefUpdate, kind: "host_research", notes: "research-brief-service.update" },
  { name: TOOL_NAMES.projectRuleWrite, kind: "host_research", notes: "project-rules writer" },
  { name: TOOL_NAMES.experimentLog, kind: "host_research", notes: "experiment/crud + runs" },
  { name: TOOL_NAMES.experimentRun, kind: "host_research", notes: "experiment-run-executor + PTY" },
  { name: TOOL_NAMES.resultsSnapshot, kind: "host_research", notes: "experiment-results-snapshot" },
  { name: TOOL_NAMES.provenanceQuery, kind: "host_research", notes: "experiment/provenance-service" },
  { name: TOOL_NAMES.interactionList, kind: "host_research", notes: "interaction store" },
  { name: TOOL_NAMES.interactionRead, kind: "host_research", notes: "interaction store" },
  { name: TOOL_NAMES.interactionWrite, kind: "host_research", notes: "interaction store" },
  { name: TOOL_NAMES.interactionOpen, kind: "host_research", notes: "interaction UI focus" },
  { name: TOOL_NAMES.imageDescribe, kind: "host_research", notes: "vision helper model" },
  { name: TOOL_NAMES.delete, kind: "host_research", notes: "host fs delete after PermissionGate" },
  { name: TOOL_NAMES.move, kind: "host_research", notes: "host fs move after PermissionGate" },
];

export const HOST_INTERACTIVE_TOOLS: readonly ToolCapability[] = [
  { name: TOOL_NAMES.question, kind: "host_interactive", notes: "InteractionBroker hang + question_requested" },
  { name: TOOL_NAMES.suggestPlan, kind: "host_interactive", notes: "InteractionBroker hang + plan_suggested" },
];

export const HOST_CUSTOM_TOOL_CAPABILITIES: readonly ToolCapability[] = [
  ...HOST_RESEARCH_TOOLS,
  ...HOST_INTERACTIVE_TOOLS,
];

/** @deprecated Use HOST_CUSTOM_TOOL_CAPABILITIES. Kept as an alias for existing imports. */
export const BUILTIN_TOOL_CAPABILITIES = HOST_CUSTOM_TOOL_CAPABILITIES;

export function capabilityForTool(name: string): ToolCapability | undefined {
  const key = name.toLowerCase();
  return (
    PI_PRIMITIVE_TOOLS.find((row) => row.name === key)
    ?? HOST_CUSTOM_TOOL_CAPABILITIES.find((row) => row.name === key)
  );
}
