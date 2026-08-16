/**
 * Runtime-agnostic Agent contract for PrismNext.
 *
 * Renderer and domain services must speak this language only.
 * Do not put Pi types, ACP `part` rows, or OpenCode `message`/`Task` shapes here.
 */

import type { PermissionMode, SessionAgent } from "./session-agent";

export type RuntimeSessionId = string;
export type AgentTurnId = string;
export type AgentTabId = string;
export type AgentToolCallId = string;

export const AGENT_EVENT_TYPES = [
  "text_delta",
  "thinking_delta",
  "tool_started",
  "tool_progress",
  "tool_finished",
  "permission_requested",
  "question_requested",
  "usage_updated",
  "turn_finished",
  "turn_failed",
  "turn_cancelled",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export interface AgentEventBase {
  type: AgentEventType;
  runtimeSessionId: RuntimeSessionId;
  tabId: AgentTabId;
  turnId: AgentTurnId;
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

export interface UsageUpdatedEvent extends AgentEventBase {
  type: "usage_updated";
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
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
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolStartedEvent
  | ToolProgressEvent
  | ToolFinishedEvent
  | PermissionRequestedEvent
  | QuestionRequestedEvent
  | UsageUpdatedEvent
  | TurnFinishedEvent
  | TurnFailedEvent
  | TurnCancelledEvent;

export interface CreateSessionInput {
  tabId: AgentTabId;
  projectRoot: string;
  permissionMode?: PermissionMode;
  sessionAgent?: SessionAgent;
  allowedPaths?: string[];
}

export interface CreateSessionResult {
  runtimeSessionId: RuntimeSessionId;
  tabId: AgentTabId;
}

export interface TurnInput {
  runtimeSessionId: RuntimeSessionId;
  tabId: AgentTabId;
  text: string;
  systemPrompt?: string;
  permissionMode: PermissionMode;
  sessionAgent?: SessionAgent;
  allowedPaths?: string[];
  abortSignal?: AbortSignal;
}

export interface ChatStreamEnvelope {
  tabId: AgentTabId;
  type: AgentEventType;
  data: AgentEvent;
}

export function isAgentEventType(value: string): value is AgentEventType {
  return (AGENT_EVENT_TYPES as readonly string[]).includes(value);
}
