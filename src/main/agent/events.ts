/**
 * Pi session events → product AgentEvent.
 * OpenCode chat:stream mapping lives in acp/chat-stream-map.ts, not here.
 */

import type { AgentEvent } from "../../shared/agent-runtime";
import { isAgentEventType } from "../../shared/agent-runtime";
import { isPiPrimitiveToolName } from "./capability-matrix";

export function assertAgentEvent(event: AgentEvent): AgentEvent {
  if (!isAgentEventType(event.type)) {
    throw new Error(`Unknown AgentEvent type: ${String((event as { type?: string }).type)}`);
  }
  return event;
}

/** Loose Pi SDK session event — only the fields we map. */
export interface PiLikeSessionEvent {
  type?: string;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  args?: unknown;
  result?: unknown;
  partialResult?: unknown;
  assistantMessageEvent?: {
    type?: string;
    delta?: string;
  };
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  error?: string;
  message?: string;
}

export interface PiEventMapContext {
  runtimeSessionId: string;
  tabId: string;
  turnId: string;
}

function asArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/**
 * Map a Pi AgentSession event to zero or more PrismNext AgentEvents.
 * Host custom tools still emit tool_* from ToolHost. Pi primitives emit here.
 */
export function mapPiSessionEvent(
  event: PiLikeSessionEvent,
  ctx: PiEventMapContext,
): AgentEvent[] {
  const base = {
    runtimeSessionId: ctx.runtimeSessionId,
    tabId: ctx.tabId,
    turnId: ctx.turnId,
  };

  switch (event.type) {
    case "message_update": {
      const inner = event.assistantMessageEvent;
      if (inner?.type === "text_delta" && inner.delta) {
        return [{ ...base, type: "text_delta", text: inner.delta }];
      }
      if (inner?.type === "thinking_delta" && inner.delta) {
        return [{ ...base, type: "thinking_delta", text: inner.delta }];
      }
      return [];
    }
    case "tool_execution_start": {
      if (!event.toolCallId || !event.toolName || !isPiPrimitiveToolName(event.toolName)) {
        return [];
      }
      return [{
        ...base,
        type: "tool_started",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: asArgs(event.args),
      }];
    }
    case "tool_execution_update": {
      if (!event.toolCallId || !event.toolName || !isPiPrimitiveToolName(event.toolName)) {
        return [];
      }
      const text = typeof event.partialResult === "string"
        ? event.partialResult
        : undefined;
      return [{
        ...base,
        type: "tool_progress",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        text,
      }];
    }
    case "tool_execution_end": {
      if (!event.toolCallId || !event.toolName || !isPiPrimitiveToolName(event.toolName)) {
        return [];
      }
      const denied = event.isError && String(event.result ?? event.error ?? "").includes("denied");
      return [{
        ...base,
        type: "tool_finished",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        ok: !event.isError,
        denied,
        error: event.isError ? (event.error || "tool_failed") : undefined,
        result: event.result,
      }];
    }
    case "agent_end":
    case "turn_end":
      return [{ ...base, type: "turn_finished" }];
    default:
      if (event.usage) {
        return [{
          ...base,
          type: "usage_updated",
          inputTokens: event.usage.input,
          outputTokens: event.usage.output,
          cacheReadTokens: event.usage.cacheRead,
          cacheWriteTokens: event.usage.cacheWrite,
        }];
      }
      return [];
  }
}
