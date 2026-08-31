/**
 * Public facade for `src/main/prompts`.
 *
 * Code outside this directory must import from `"../prompts"` (this file).
 * Do not deep-import `assemble/`, `stable/`, `engine/`, `stack-preview`, etc.
 */

export { promptManager } from "./engine/manager";

export type { PromptContext, PromptLayer, PromptModule } from "./types";
export { buildPromptContext, type BuildPromptContextOptions } from "./context";

export {
  assembleAgentSystemPrompt,
  buildAgentSystemPromptParts,
  formatLeadAgentSection,
  joinAgentSystemPromptParts,
  HOST_SYSTEM_IDENTITY,
  type AgentSystemPromptInput,
  type AgentSystemPromptParts,
} from "./assemble";

export {
  composeStableSystem,
  CORE_PERSONA_PROMPT,
  createCorePersonaLayer,
  RESEARCH_REASONING_PROMPT,
  REPLY_DEPTH_PROMPT,
  buildWorkspacePrompt,
  GLOBAL_MODULE_ORDER,
  type GlobalModuleKey,
} from "./stable";

export {
  resolveStableSystemModules,
  resolveSharedProfileModules,
  resolveOrchestratorOnlyProfileModules,
  resolveExpertOnlyProfileModules,
  resolveProfileSelectableModules,
  resolveOrchestratorProfileModuleKeys,
  resolveSubagentProfileModuleKeys,
  resolveSubagentProfileModuleKeysFor,
  composeProfileModulePrompts,
  composeOrchestratorProfileModulePrompts,
  composeSubagentProfileModulePrompts,
  resolveActiveModuleKeys,
  resolveOrchestratorActiveModuleKeys,
  resolveSubagentActiveModuleKeys,
} from "./resolve-active-modules";

export {
  buildPlanModeTurnAppendix,
  buildIntensiveReadingInstruction,
  type IntensivePaper,
  type IntensiveReadingOptions,
} from "./per-turn";

export {
  PRISM_RULES_REL,
  listProjectRules,
  getPromptProjectRules,
  installProjectRule,
  deleteProjectRule,
  setProjectRuleEnabled,
  type ProjectRuleInfo,
  type GetPromptProjectRulesOptions,
} from "./rules-sync";

export {
  buildPromptStackPreview,
  formatPromptStackPreviewMarkdown,
  type PromptStackPreview,
  type PromptStackSection,
  type BuildPromptStackPreviewOptions,
} from "./stack-preview";
