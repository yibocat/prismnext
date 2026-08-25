/**
 * PrismNext Agent runtime domain.
 *
 * Product conversations use Pi (`agent:*` + RuntimeRegistry + AgentSessionStore).
 */

export type { AgentRuntime, AgentEventListener } from "./runtime";
export { newRuntimeSessionId, newTurnId, newToolCallId } from "./runtime";
export type {
  Conversation,
  ConversationBinding,
  ConversationId,
  ConversationTurn,
  ContentBlock as ConversationContentBlock,
  LiveTurn,
  PendingQuestion,
  ConversationSubagentRun,
  TurnMessageMeta,
} from "../../shared/agent/conversation";
export { emptyConversation, newConversationId } from "../../shared/agent/conversation";
export {
  mapPiSessionEvent,
  assertAgentEvent,
} from "./events";
export { ToolHost } from "./tool-host";
export type { ToolExecuteContext, ToolExecuteResult } from "./tool-host";
export { PermissionGate, evaluateHardDeny, extractToolPathContext } from "./permission-gate";
export type { PermissionGateRequest, PermissionGateResult } from "./permission-gate";
export {
  AgentSessionStore,
  resolvePiAgentRoot,
  resolvePiRuntimeSessionDir,
  FORBIDDEN_PROJECT_RESOURCE_DIRS,
  SESSION_SCHEMA_VERSION,
} from "./session-store";
export { RuntimeRegistry } from "./runtime-registry";
export type { StartRuntimeInput, StartedRuntime } from "./runtime-registry";
export type {
  AgentSessionRecord,
  AgentTurnRecord,
  AgentToolCallSnapshot,
  CreateSessionRecordInput,
  RollbackSessionResult,
  RestoreRegretResult,
} from "./session-store";
export {
  hydrateSessionRecordToConversation,
} from "./session-hydrator";
export { InProcessAgentRuntime, createInProcessSpike } from "./in-process-runtime";
export type { ScriptedToolCall } from "./in-process-runtime";
export {
  PiSdkRuntime,
  ClosedResourceLoader,
  closedPiSessionOptions,
  createPiSessionManager,
  truncatePersistedPiSession,
  restorePersistedPiSessionLeaf,
  createPiNativeTools,
  createPiSdkSessionFactory,
  createPiSubagentRunnerFactory,
  probePiEmbedCompatibility,
  isNodeCompatibleWithPi,
  tryLoadPiSdkModule,
  PI_SDK_PACKAGE,
  PI_AI_PACKAGE,
  PI_SDK_PINNED_VERSION,
  PI_MIN_NODE,
} from "./pi-sdk-runtime";
export type {
  PiSdkSessionFactoryInput,
  PiToolExecutionContext,
} from "./pi-sdk-runtime";
export {
  resolveAgentAuth,
  buildAgentSystemPrompt,
  buildAgentUserText,
  createAgentNativeTools,
  createAgentService,
  getAgentService,
  disposeAgentService,
  HOST_SYSTEM_IDENTITY,
  PI_DEFAULT_CODING_IDENTITY,
} from "./agent-service";
export * from "./team-binding";
export * from "./pi-subsession-runtime";
export * from "./tools/index";
export {
  BUILTIN_TOOL_CAPABILITIES,
  HOST_CUSTOM_TOOL_CAPABILITIES,
  HOST_INTERACTIVE_TOOLS,
  HOST_RESEARCH_TOOLS,
  PI_PRIMITIVE_TOOLS,
  PI_PRIMITIVE_TOOL_NAMES,
  capabilityForTool,
  isPiPrimitiveToolName,
} from "./capability-matrix";
export { InteractionBroker } from "./interaction-broker";
export { wrapPiPrimitiveTools } from "./pi-primitive-tools";
export { loadPiSkillsFromDirs } from "./skill-loader";
export type { HostSkillDir } from "./skill-loader";
export {
  AgentMcpHost,
  isMcpToolName,
  mcpDefsFromTeamAssets,
  mcpToolName,
  selectMcpServers,
} from "./mcp-host";
export {
  listAgentModels,
  listAgentModelsCatalog,
  testAgentConnection,
  getAgentModelEffort,
  getAgentEffortCatalog,
  mapProductProviderToPi,
  mapPiProviderToProduct,
} from "./model-catalog";
