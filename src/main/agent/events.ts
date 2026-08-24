/**
 * Pi session events → product AgentEvent.
 * Product turns settle only on `agent_end` — Pi `turn_end` is an agent-loop boundary.
 */

import type { AgentEvent } from "../../shared/agent/runtime";
import { isAgentEventType, toolArgsHaveContent } from "../../shared/agent/runtime";
import { costFromPiUsage, occupancyFromPiUsage } from "../../shared/agent/context-usage";
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
    contentIndex?: number;
    toolCall?: {
      id?: string;
      name?: string;
      arguments?: unknown;
      args?: unknown;
    };
    partial?: {
      usage?: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
        cost?: { total?: number };
      };
      content?: Array<{
        type?: string;
        id?: string;
        name?: string;
        arguments?: unknown;
        args?: unknown;
      }>;
    };
  };
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: { total?: number };
  };
  error?: string;
  errorMessage?: string;
  message?: string | PiLikeAssistantMessage;
  messages?: PiLikeAssistantMessage[];
}

interface PiLikeAssistantMessage {
  role?: string;
  stopReason?: string;
  errorMessage?: string;
}

export interface PiEventMapContext {
  runtimeSessionId: string;
  tabId: string;
  turnId: string;
}

function asArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStreamingToolCall(value: unknown): { id: string; name: string; args: Record<string, unknown> } | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const id = typeof rec.id === "string" ? rec.id.trim() : "";
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!id || !name) return null;
  return { id, name, args: asArgs(rec.arguments ?? rec.args) };
}

function streamingToolFromAssistantEvent(
  inner: NonNullable<PiLikeSessionEvent["assistantMessageEvent"]>,
): { id: string; name: string; args: Record<string, unknown> } | null {
  const fromEnd = asStreamingToolCall(inner.toolCall);
  if (fromEnd) return fromEnd;
  const index = typeof inner.contentIndex === "number" ? inner.contentIndex : -1;
  const content = inner.partial?.content;
  if (!Array.isArray(content) || index < 0) return null;
  return asStreamingToolCall(content[index]);
}

function usageToEvent(
  base: { runtimeSessionId: string; tabId: string; turnId: string },
  u: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } },
): AgentEvent | null {
  const occupancy = occupancyFromPiUsage(u);
  const costUsd = costFromPiUsage(u);
  if (occupancy == null && !u.output && !u.cacheRead && !u.cacheWrite && costUsd == null) {
    return null;
  }
  return {
    ...base,
    type: "usage_updated",
    ...(occupancy != null ? { inputTokens: occupancy } : {}),
    outputTokens: u.output,
    cacheReadTokens: u.cacheRead,
    cacheWriteTokens: u.cacheWrite,
    ...(costUsd != null ? { costUsd } : {}),
  };
}

/** Provider 500 bodies look like `500 {"type":"error","error":{"message":"…"}}`. */
export function formatProviderError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Provider returned an error.";
  const match = trimmed.match(/^(\d{3})\s+([\s\S]+)$/);
  if (!match) return trimmed;
  const status = match[1];
  const rest = match[2].trim();
  try {
    const parsed = JSON.parse(rest) as {
      error?: { message?: string; error?: { message?: string } };
      message?: string;
    };
    const message =
      parsed.error?.error?.message
      ?? parsed.error?.message
      ?? parsed.message;
    if (typeof message === "string" && message.trim()) {
      return `${message.trim()} (${status})`;
    }
  } catch {
    // keep a short status label
  }
  return `Provider error (${status})`;
}

function assistantMessageFailure(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as PiLikeAssistantMessage;
  if (rec.role != null && rec.role !== "assistant") return null;
  if (rec.stopReason !== "error") return null;
  return formatProviderError(
    typeof rec.errorMessage === "string" ? rec.errorMessage : "",
  );
}

function lastAssistantFailure(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const fail = assistantMessageFailure(messages[i]);
    if (fail) return fail;
  }
  return null;
}

/** Pi encodes API failures on the assistant message, then still emits `agent_end`. */
export function piTurnFailure(event: PiLikeSessionEvent): string | null {
  if (typeof event.error === "string" && event.error.trim()) {
    return formatProviderError(event.error);
  }
  if (typeof event.errorMessage === "string" && event.errorMessage.trim()) {
    return formatProviderError(event.errorMessage);
  }
  return lastAssistantFailure(event.messages) ?? assistantMessageFailure(event.message);
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
      if (
        inner?.type === "toolcall_start"
        || inner?.type === "toolcall_delta"
        || inner?.type === "toolcall_end"
      ) {
        const call = streamingToolFromAssistantEvent(inner);
        if (call) {
          return [{
            ...base,
            type: "tool_started",
            toolCallId: call.id,
            toolName: call.name,
            args: call.args,
            preparing: inner.type !== "toolcall_end" && !toolArgsHaveContent(call.args),
          }];
        }
      }
      // Pi reports usage on the assistant message snapshot; surface it so the
      // context ring can show occupancy / spend while streaming.
      const u = inner?.partial?.usage ?? event.usage;
      const usageEvent = u ? usageToEvent(base, u) : null;
      return usageEvent ? [usageEvent] : [];
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
    // Pi emits `turn_end` after EVERY agent loop turn — including the
    // tool-call round(s) that precede the final reply. Mapping every `turn_end`
    // to `turn_finished` prematurely commits the live turn (before the final
    // text arrives) and later text_deltas get dropped as "late". Only
    // `agent_end` marks the real end of the whole prompt. Pi still emits it
    // after a provider 500 — the assistant message then has stopReason "error"
    // and empty content. Mapping that to turn_finished hid the failure.
    case "agent_end": {
      const error = piTurnFailure(event);
      if (error) return [{ ...base, type: "turn_failed", error }];
      return [{ ...base, type: "turn_finished" }];
    }
    default:
      if (event.usage) {
        const usageEvent = usageToEvent(base, event.usage);
        return usageEvent ? [usageEvent] : [];
      }
      return [];
  }
}
