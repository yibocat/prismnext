/**
 * OpenCode `chat:stream` → AgentEvent adapter.
 * Lives next to ACP, not in the Pi agent core.
 */

import type { AgentEvent } from "../../shared/agent-runtime";

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
