/**
 * PrismNext Agent runtime domain.
 *
 * Production `ipc/chat.ts` must keep using AcpService until the decision gate
 * approves a one-shot switch. Do not register this as the default chat backend.
 */

export type { AgentRuntime, AgentEventListener } from "./runtime";
export { newRuntimeSessionId, newTurnId, newToolCallId } from "./runtime";
export {
  toChatStreamEnvelope,
  mapPiSessionEvent,
  mapChatStreamToAgentEvent,
  broadcastChatStream,
  ChatStreamDeltaTracker,
  assertAgentEvent,
} from "./events";
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
export { createLiteratureNativeTools } from "./literature-native-tools";
export { createLatexNativeTools } from "./latex-native-tools";
export { createResearchBriefNativeTools } from "./research-brief-native-tools";
export { createExperimentNativeTools } from "./experiment-native-tools";
export { createInteractionNativeTools } from "./interaction-native-tools";
export { createImageDescribeNativeTools } from "./image-describe-native-tools";
export { createShellAndFsNativeTools } from "./shell-and-fs-native-tools";
export { createInteractiveNativeTools } from "./interactive-native-tools";
export { BUILTIN_TOOL_CAPABILITIES, OPENCODE_BUILTIN_REBUILD, capabilityForTool } from "./capability-matrix";
