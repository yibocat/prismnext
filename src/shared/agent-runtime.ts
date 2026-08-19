/**
 * Runtime-agnostic Agent contract for PrismNext.
 *
 * Renderer and domain services must speak this language only.
 * Do not put Pi types, ACP `part` rows, or OpenCode `message`/`Task` shapes here.
 */

import type { PermissionMode, SessionAgent } from "./session-agent";
import type { ContextUsageBreakdown } from "./agent-context-usage";

export type RuntimeSessionId = string;
export type AgentTurnId = string;
export type AgentTabId = string;
export type AgentToolCallId = string;

export const AGENT_EVENT_TYPES = [
  "session_created",
  "prepare_phase",
  "text_delta",
  "thinking_delta",
  "tool_started",
  "tool_progress",
  "tool_finished",
  "permission_requested",
  "question_requested",
  "plan_suggested",
  "usage_updated",
  "turn_finished",
  "turn_failed",
  "turn_cancelled",
] as const;

/** Settings / env flag: when true, production chat may paint text from AgentEvent. */
export const AGENT_EVENT_UI_SETTING_KEY = "agentEventUi";

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export interface SubagentEventContext {
  parentToolCallId: string;
  expertFqid: string;
  expertName: string;
}

export interface AgentEventBase {
  type: AgentEventType;
  runtimeSessionId: RuntimeSessionId;
  tabId: AgentTabId;
  turnId: AgentTurnId;
  /** Stable timeline id for idempotent Conversation projection. */
  eventId?: string;
  subagent?: SubagentEventContext;
}

export interface SessionCreatedEvent extends AgentEventBase {
  type: "session_created";
  /**
   * Runtime / engine binding only.
   * Never use as Conversation.conversationId or a history list key.
   */
  sessionId: string;
}

export interface PreparePhaseEvent extends AgentEventBase {
  type: "prepare_phase";
  phase: string | null;
}

export interface TextDeltaEvent extends AgentEventBase {
  type: "text_delta";
  text: string;
}

export interface ThinkingDeltaEvent extends AgentEventBase {
  type: "thinking_delta";
  text: string;
}

export interface ToolStartedEvent extends AgentEventBase {
  type: "tool_started";
  toolCallId: AgentToolCallId;
  toolName: string;
  args: Record<string, unknown>;
  /** True only while tool arguments are still empty. The card appears immediately. */
  preparing?: boolean;
}

/** True once any streamed tool argument has real content. */
export function toolArgsHaveContent(args: Record<string, unknown> | undefined): boolean {
  if (!args) return false;
  return Object.values(args).some((value) => {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number" || typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return false;
  });
}

export interface ToolProgressEvent extends AgentEventBase {
  type: "tool_progress";
  toolCallId: AgentToolCallId;
  toolName: string;
  text?: string;
}

export interface ToolFinishedEvent extends AgentEventBase {
  type: "tool_finished";
  toolCallId: AgentToolCallId;
  toolName: string;
  ok: boolean;
  denied?: boolean;
  error?: string;
  result?: unknown;
}

export interface PermissionRequestedEvent extends AgentEventBase {
  type: "permission_requested";
  requestId: string;
  toolCallId: AgentToolCallId;
  toolName: string;
  args: Record<string, unknown>;
}

export interface QuestionRequestedEvent extends AgentEventBase {
  type: "question_requested";
  requestId: string;
  prompt: string;
  options?: string[];
}

export interface PlanSuggestedEvent extends AgentEventBase {
  type: "plan_suggested";
  requestId: string;
  reason: string;
}

export interface UsageUpdatedEvent extends AgentEventBase {
  type: "usage_updated";
  /** Current context-window occupancy (not billed-input for this call). */
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Session spend in USD from Pi usage totals (cumulative across the session). */
  costUsd?: number;
  windowSize?: number;
  breakdown?: ContextUsageBreakdown;
  /** After compact: drop occupancy until the next model reply. */
  occupancyReset?: boolean;
}

export interface TurnFinishedEvent extends AgentEventBase {
  type: "turn_finished";
}

export interface TurnFailedEvent extends AgentEventBase {
  type: "turn_failed";
  error: string;
}

export interface TurnCancelledEvent extends AgentEventBase {
  type: "turn_cancelled";
}

export type AgentEvent =
  | SessionCreatedEvent
  | PreparePhaseEvent
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolStartedEvent
  | ToolProgressEvent
  | ToolFinishedEvent
  | PermissionRequestedEvent
  | QuestionRequestedEvent
  | PlanSuggestedEvent
  | UsageUpdatedEvent
  | TurnFinishedEvent
  | TurnFailedEvent
  | TurnCancelledEvent;

export interface CreateSessionInput {
  tabId: AgentTabId;
  projectRoot: string;
  conversationId?: string;
  boundCheckoutPath?: string;
  permissionMode?: PermissionMode;
  sessionAgent?: SessionAgent;
  allowedPaths?: string[];
  /** Existing Pi SessionManager file to reopen. */
  piSessionFile?: string;
}

export interface CreateSessionResult {
  runtimeSessionId: RuntimeSessionId;
  tabId: AgentTabId;
  conversationId?: string;
  piSessionFile?: string;
}

export interface AgentTurnImage {
  mimeType: string;
  /** Raw base64 image bytes (no data: prefix). */
  data: string;
  name?: string;
}

export interface TurnInput {
  runtimeSessionId: RuntimeSessionId;
  tabId: AgentTabId;
  turnId?: AgentTurnId;
  text: string;
  /** Inline images for vision-capable models. */
  images?: AgentTurnImage[];
  /** Persistable user attachments (paths), independent of vision bytes. */
  attachments?: Array<{ name: string; kind: "image" | "file"; path: string }>;
  systemPrompt?: string;
  permissionMode: PermissionMode;
  sessionAgent?: SessionAgent;
  allowedPaths?: string[];
  abortSignal?: AbortSignal;
  /** Apply this model on the live Pi session before prompting, if it differs. */
  provider?: string;
  modelId?: string;
  apiKey?: string;
}

export function isAgentEventType(value: string): value is AgentEventType {
  return (AGENT_EVENT_TYPES as readonly string[]).includes(value);
}
