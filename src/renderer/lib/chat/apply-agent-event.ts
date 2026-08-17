/**
 * Paint production chat from AgentEvent deltas.
 *
 * `_upsertLastMessage` replaces the last text/thinking block with the incoming
 * snapshot — callers must re-accumulate deltas here before upserting.
 */

import { isPrismSystemPromptText } from "@/lib/chat/session-message-hydrate";
import type { ContentBlock } from "@/stores/chat-store";
import type { AgentEvent } from "@shared/agent-runtime";

export interface AgentEventPaintSink {
  text: string;
  thinking: string;
}

export function emptyAgentEventPaintSink(): AgentEventPaintSink {
  return { text: "", thinking: "" };
}

export function applyAgentEvent(
  sink: AgentEventPaintSink,
  event: AgentEvent,
): AgentEventPaintSink {
  if (event.subagent) {
    return sink;
  }
  switch (event.type) {
    case "text_delta":
      return { ...sink, text: sink.text + event.text };
    case "thinking_delta":
      return { ...sink, thinking: sink.thinking + event.text };
    case "turn_finished":
    case "turn_failed":
    case "turn_cancelled":
    case "session_created":
      return emptyAgentEventPaintSink();
    default:
      return sink;
  }
}

export function contentBlocksFromAgentSink(sink: AgentEventPaintSink): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (sink.thinking) blocks.push({ type: "thinking", thinking: sink.thinking });
  if (sink.text) blocks.push({ type: "text", text: sink.text });
  return blocks;
}

export function shouldDropAssistantText(
  text: string,
  opts: { lastUserText: string; hasRealContent: boolean },
): boolean {
  if (!text) return true;
  if (isPrismSystemPromptText(text)) return true;
  if (!opts.hasRealContent && text.trim() === opts.lastUserText.trim()) return true;
  return false;
}

export function isLegacyTextOrThinkingPart(partType: string): boolean {
  return partType === "text" || partType === "thinking" || partType === "reasoning";
}
