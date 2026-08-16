/**
 * Event standardization — Pi / OpenCode payloads never leave this module.
 */

import type { AgentEvent, ChatStreamEnvelope } from "../../shared/agent-runtime";
import { isAgentEventType } from "../../shared/agent-runtime";

export function toChatStreamEnvelope(event: AgentEvent): ChatStreamEnvelope {
  return {
    tabId: event.tabId,
    type: event.type,
    data: event,
  };
}

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

/**
 * Map a Pi AgentSession event to zero or more PrismNext AgentEvents.
 * Unknown Pi types are dropped — they must not leak to the UI.
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
    case "tool_execution_start":
      return [{
        ...base,
        type: "tool_started",
        toolCallId: event.toolCallId || "unknown",
        toolName: event.toolName || "unknown",
        args: {},
      }];
    case "tool_execution_update":
      return [{
        ...base,
        type: "tool_progress",
        toolCallId: event.toolCallId || "unknown",
        toolName: event.toolName || "unknown",
      }];
    case "tool_execution_end":
      return [{
        ...base,
        type: "tool_finished",
        toolCallId: event.toolCallId || "unknown",
        toolName: event.toolName || "unknown",
        ok: event.isError !== true,
        error: event.isError ? (event.error || event.message || "tool_error") : undefined,
      }];
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
