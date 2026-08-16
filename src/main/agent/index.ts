/**
 * PrismNext Agent runtime domain.
 *
 * Production `ipc/chat.ts` must keep using AcpService until the decision gate
 * approves a one-shot switch. Do not register this as the default chat backend.
 */

export type { AgentRuntime, AgentEventListener } from "./runtime";
export { newRuntimeSessionId, newTurnId, newToolCallId } from "./runtime";
export { toChatStreamEnvelope, mapPiSessionEvent, assertAgentEvent } from "./events";
export { ToolHost } from "./tool-host";
export type { NativeToolDefinition, ToolExecuteContext, ToolExecuteResult } from "./tool-host";
export { PermissionGate, evaluateHardDeny, extractToolPathContext } from "./permission-gate";
export type { PermissionGateRequest, PermissionGateResult } from "./permission-gate";
export { AgentSessionStore, resolvePiAgentRoot, FORBIDDEN_PROJECT_RESOURCE_DIRS } from "./session-store";
export { InProcessAgentRuntime, createInProcessSpike } from "./in-process-runtime";
export type { ScriptedToolCall } from "./in-process-runtime";
export {
  PiSdkRuntime,
  ClosedResourceLoader,
  closedPiSessionOptions,
  createPiNativeTools,
  createPiSdkSessionFactory,
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
  resolvePiLabAuth,
  buildPiLabSystemPrompt,
  buildPiLabUserText,
  createPiLabNativeTools,
  createPiLabExperimentRunner,
  createPiLabService,
  getPiLabService,
  disposePiLabService,
  HOST_SYSTEM_IDENTITY,
  PI_DEFAULT_CODING_IDENTITY,
} from "./pi-lab-service";
export { createRepresentativeTools } from "./representative-tools";
export { BUILTIN_TOOL_CAPABILITIES, OPENCODE_BUILTIN_REBUILD, capabilityForTool } from "./capability-matrix";
