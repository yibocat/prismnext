/**
 * Frozen capability matrix for the 29 BUILTIN_TOOLS.
 * Do not invent a "34 tools" count — OpenCode builtins are a separate rebuild list.
 */

import { TOOL_NAMES } from "../../shared/tool-names";

export type ToolCapabilityKind =
  | "reuse_main_service"
  | "reimplement_in_tool_host"
  | "opencode_builtin_rebuild";

export interface ToolCapability {
  name: string;
  kind: ToolCapabilityKind;
  notes: string;
}

/** PrismNext custom tools that already have a Main-process service. */
export const REUSE_MAIN_SERVICE_TOOLS: readonly ToolCapability[] = [
  { name: TOOL_NAMES.literatureSearch, kind: "reuse_main_service", notes: "literature-service.searchPapers" },
  { name: TOOL_NAMES.literatureDiscover, kind: "reuse_main_service", notes: "literature-discovery.discoverLiterature" },
  { name: TOOL_NAMES.literatureStage, kind: "reuse_main_service", notes: "literature-bridge / enrich" },
  { name: TOOL_NAMES.literatureAdd, kind: "reuse_main_service", notes: "literature-service create/enrich" },
  { name: TOOL_NAMES.literatureDelete, kind: "reuse_main_service", notes: "literature-service delete" },
  { name: TOOL_NAMES.literatureRead, kind: "reuse_main_service", notes: "literature-service + extracts" },
  { name: TOOL_NAMES.literatureReadPdf, kind: "reuse_main_service", notes: "literature-pdf-resolve" },
  { name: TOOL_NAMES.literatureIntensiveReading, kind: "reuse_main_service", notes: "literature intensive pipeline" },
  { name: TOOL_NAMES.citationHealth, kind: "reuse_main_service", notes: "citation health service" },
  { name: TOOL_NAMES.literatureExportBib, kind: "reuse_main_service", notes: "bibliography export" },
  { name: TOOL_NAMES.latexRoot, kind: "reuse_main_service", notes: "latex-service root resolve" },
  { name: TOOL_NAMES.latexCompile, kind: "reuse_main_service", notes: "compiler.ts under .prismnext/compile" },
  { name: TOOL_NAMES.researchBriefRead, kind: "reuse_main_service", notes: "research-brief-service.read" },
  { name: TOOL_NAMES.researchBriefUpdate, kind: "reuse_main_service", notes: "research-brief-service.update" },
  { name: TOOL_NAMES.projectRuleWrite, kind: "reuse_main_service", notes: "project-rules writer" },
  { name: TOOL_NAMES.experimentLog, kind: "reuse_main_service", notes: "experiment-log-service" },
  { name: TOOL_NAMES.experimentRun, kind: "reuse_main_service", notes: "experiment-run-executor + PTY" },
  { name: TOOL_NAMES.resultsSnapshot, kind: "reuse_main_service", notes: "experiment-results-snapshot" },
  { name: TOOL_NAMES.provenanceQuery, kind: "reuse_main_service", notes: "provenance-service" },
  { name: TOOL_NAMES.interactionList, kind: "reuse_main_service", notes: "interaction store" },
  { name: TOOL_NAMES.interactionRead, kind: "reuse_main_service", notes: "interaction store" },
  { name: TOOL_NAMES.interactionWrite, kind: "reuse_main_service", notes: "interaction store" },
  { name: TOOL_NAMES.interactionOpen, kind: "reuse_main_service", notes: "interaction UI focus" },
  { name: TOOL_NAMES.imageDescribe, kind: "reuse_main_service", notes: "vision helper model" },
];

/**
 * Custom tools that today poll a disk bridge from an OpenCode plugin.
 * ToolHost must call Main services / UI roundtrips directly.
 */
export const REIMPLEMENT_IN_TOOL_HOST: readonly ToolCapability[] = [
  { name: TOOL_NAMES.question, kind: "reimplement_in_tool_host", notes: "UI question roundtrip; no disk poll" },
  { name: TOOL_NAMES.bash, kind: "reimplement_in_tool_host", notes: "ai-pty / ai-bash-runner after PermissionGate" },
  { name: TOOL_NAMES.delete, kind: "reimplement_in_tool_host", notes: "fs delete after PermissionGate" },
  { name: TOOL_NAMES.move, kind: "reimplement_in_tool_host", notes: "fs move after PermissionGate" },
  { name: TOOL_NAMES.suggestPlan, kind: "reimplement_in_tool_host", notes: "Plan consent strip; no OpenCode Task" },
];

/** Accurate BUILTIN_TOOLS matrix — must stay length 29. */
export const BUILTIN_TOOL_CAPABILITIES: readonly ToolCapability[] = [
  ...REIMPLEMENT_IN_TOOL_HOST,
  ...REUSE_MAIN_SERVICE_TOOLS,
];

/**
 * OpenCode-hosted builtins that are not in BUILTIN_TOOLS.
 * Rebuild on ToolHost later; not a Spike target.
 */
export const OPENCODE_BUILTIN_REBUILD: readonly ToolCapability[] = [
  { name: "read", kind: "opencode_builtin_rebuild", notes: "project-scoped file read" },
  { name: "write", kind: "opencode_builtin_rebuild", notes: "must go through PermissionGate" },
  { name: "edit", kind: "opencode_builtin_rebuild", notes: "must go through PermissionGate" },
  { name: "apply_patch", kind: "opencode_builtin_rebuild", notes: "must go through PermissionGate" },
  { name: "grep", kind: "opencode_builtin_rebuild", notes: "in-project search" },
  { name: "glob", kind: "opencode_builtin_rebuild", notes: "in-project glob" },
  { name: "webfetch", kind: "opencode_builtin_rebuild", notes: "network fetch" },
  { name: "websearch", kind: "opencode_builtin_rebuild", notes: "network search" },
  { name: "task", kind: "opencode_builtin_rebuild", notes: "do not copy; Teams becomes SubagentRuntime" },
  { name: "skill", kind: "opencode_builtin_rebuild", notes: "PrismNext skills under .prismnext/agent/skills" },
  { name: "todowrite", kind: "opencode_builtin_rebuild", notes: "optional later" },
];

export function capabilityForTool(name: string): ToolCapability | undefined {
  const key = name.toLowerCase();
  return (
    BUILTIN_TOOL_CAPABILITIES.find((row) => row.name === key)
    ?? OPENCODE_BUILTIN_REBUILD.find((row) => row.name === key)
  );
}
