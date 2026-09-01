/**
 * Public facade for `src/main/prompts`.
 *
 * Code outside this directory must import from `"../prompts"` (this file).
 * Do not deep-import `assemble/`, `stable/`, `modules/<key>/`, `engine/`, `stack-preview`, etc.
 *
 * Capability blocks live under `modules/<key>/`; consume them via this barrel
 * or `./modules` (catalog). Never import a block's `prompt.ts` / `build.ts`.
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
  ALL_MODULES,
  CHAT_CITATION_STAGING_PROMPT,
  CITATION_AUDIT_PROMPT,
  LITERATURE_LIBRARY_PROMPT,
  WEB_RESEARCH_PROMPT,
  ORCHESTRATOR_JUDGMENT_PROMPT,
  buildOrchestratorJudgmentPrompt,
  buildManuscriptCompilePrompt,
  PROJECT_BRIEF_PROMPT,
  PROJECT_RULES_MEMORY_PROMPT,
  RESEARCH_DESIGN_PROMPT,
  EXPERIMENTS_PROMPT,
  INTERACTION_PROMPT,
  SUBAGENT_ROLE_PROMPT,
} from "./modules";

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
