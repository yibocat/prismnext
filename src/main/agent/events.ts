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
    case "tool_execution_update":
    case "tool_execution_end":
      // ToolHost already emits tool_started / tool_finished with real args.
      return [];
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

export interface ChatStreamPayload {
  tabId: string;
  type: string;
  data?: unknown;
}

export interface ChatStreamMapContext {
  runtimeSessionId: string;
  turnId: string;
  tracker?: ChatStreamDeltaTracker;
}

/** Turns OpenCode accumulated part text into true AgentEvent deltas. */
export class ChatStreamDeltaTracker {
  private readonly text = new Map<string, string>();
  private readonly thinking = new Map<string, string>();

  takeTextDelta(tabId: string, full: string): string {
    const prev = this.text.get(tabId) ?? "";
    const delta = full.startsWith(prev) ? full.slice(prev.length) : full;
    this.text.set(tabId, full);
    return delta;
  }

  takeThinkingDelta(tabId: string, full: string): string {
    const prev = this.thinking.get(tabId) ?? "";
    const delta = full.startsWith(prev) ? full.slice(prev.length) : full;
    this.thinking.set(tabId, full);
    return delta;
  }

  reset(tabId: string): void {
    this.text.delete(tabId);
    this.thinking.delete(tabId);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function partFromStreamData(data: unknown): Record<string, unknown> | null {
  const rec = asRecord(data);
  if (!rec) return null;
  const part = rec.part;
  if (part && typeof part === "object") return part as Record<string, unknown>;
  if (typeof rec.type === "string") return rec;
  return null;
}

/**
 * Translate a production `chat:stream` payload into at most one AgentEvent.
 * Unknown OpenCode types are dropped — they must not leak as `part` shapes.
 */
export function mapChatStreamToAgentEvent(
  payload: ChatStreamPayload,
  ctx: ChatStreamMapContext,
): AgentEvent | null {
  const base = {
    runtimeSessionId: ctx.runtimeSessionId,
    tabId: payload.tabId,
    turnId: ctx.turnId,
  };
  const data = asRecord(payload.data) ?? {};

  if (payload.type === "system.prepare") {
    const phase = data.phase;
    return {
      ...base,
      type: "prepare_phase",
      phase: typeof phase === "string" || phase === null ? phase : null,
    };
  }

  if (payload.type === "session.created" || payload.type === "system.sessionCreated") {
    const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
    if (!sessionId) return null;
    return { ...base, type: "session_created", sessionId };
  }

  if (payload.type === "session.error") {
    const error = typeof data.error === "string" && data.error.trim()
      ? data.error
      : typeof data.message === "string" ? data.message : "session_error";
    ctx.tracker?.reset(payload.tabId);
    return { ...base, type: "turn_failed", error };
  }

  if (payload.type === "session.usage") {
    const used = typeof data.used === "number" ? data.used : undefined;
    const size = typeof data.size === "number" ? data.size : undefined;
    return {
      ...base,
      type: "usage_updated",
      inputTokens: used,
      outputTokens: size,
    };
  }

  if (payload.type !== "message.part.updated") return null;

  const part = partFromStreamData(payload.data);
  if (!part) return null;
  const partType = typeof part.type === "string" ? part.type : "";

  if (partType === "text") {
    const full = typeof part.text === "string" ? part.text : "";
    if (!full) return null;
    const text = ctx.tracker ? ctx.tracker.takeTextDelta(payload.tabId, full) : full;
    if (!text) return null;
    return { ...base, type: "text_delta", text };
  }

  if (partType === "thinking" || partType === "reasoning") {
    const full = typeof part.thinking === "string"
      ? part.thinking
      : typeof part.text === "string" ? part.text : "";
    if (!full) return null;
    const text = ctx.tracker ? ctx.tracker.takeThinkingDelta(payload.tabId, full) : full;
    if (!text) return null;
    return { ...base, type: "thinking_delta", text };
  }

  return null;
}

/** Dual-emit production stream + AgentEvent. `send` is `webContents.send`. */
export function broadcastChatStream(
  send: (channel: string, payload: unknown) => void,
  payload: ChatStreamPayload,
  ctx: ChatStreamMapContext,
): AgentEvent | null {
  send("chat:stream", payload);
  const event = mapChatStreamToAgentEvent(payload, ctx);
  if (event) send("chat:agent-event", event);
  return event;
}
