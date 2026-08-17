import { useEffect, useRef } from "react";
import { useChatStore, type ContentBlock } from "@/stores/chat-store";
import { usePermissionStore } from "@/stores/permission-store";
import { schedulePermissionTimeout } from "@/stores/permission-actions";
import {
  applyAgentEvent,
  contentBlocksFromAgentSink,
  emptyAgentEventPaintSink,
} from "@/lib/chat/apply-agent-event";
import { isExperimentalPiRuntime } from "@shared/pi-lab";
import type { AgentEvent } from "@shared/agent-runtime";

function resolvePiTabId(eventTabId: string): string | null {
  const store = useChatStore.getState();
  const byId = store.tabs.find((tab) => tab.id === eventTabId && isExperimentalPiRuntime(tab.runtime));
  if (byId) return byId.id;
  const only = store.tabs.find((tab) => isExperimentalPiRuntime(tab.runtime));
  return only?.id ?? null;
}

function upsertPiBlocks(tabId: string, blocks: ContentBlock[]): void {
  const tab = useChatStore.getState().tabs.find((item) => item.id === tabId);
  const existing = tab?.streamingMessage?.message?.content ?? [];
  const merged = [...existing];
  for (const block of blocks) {
    if (block.type === "tool_use" && block.id) {
      const idx = merged.findIndex((item) => item.type === "tool_use" && item.id === block.id);
      if (idx >= 0) merged[idx] = { ...merged[idx], ...block };
      else merged.push(block);
      continue;
    }
    if (block.type === "text" || block.type === "thinking") {
      const idx = merged.findIndex((item) => item.type === block.type && !item._progress);
      if (idx >= 0) merged[idx] = block;
      else merged.push(block);
      continue;
    }
    merged.push(block);
  }
  useChatStore.getState()._upsertLastMessage(tabId, {
    type: "assistant",
    message: { content: merged },
  });
}

export function usePiChatEvents(): void {
  const paintRef = useRef(new Map<string, ReturnType<typeof emptyAgentEventPaintSink>>());

  useEffect(() => {
    const offEvent = window.electronAPI.onPiLabEvent((event: AgentEvent) => {
      const tabId = resolvePiTabId(event.tabId);
      if (!tabId) return;
      const store = useChatStore.getState();

      if (event.type === "session_created" && "sessionId" in event && event.sessionId) {
        store._setSessionId(tabId, event.sessionId);
      }

      const prev = paintRef.current.get(tabId) ?? emptyAgentEventPaintSink();
      const next = applyAgentEvent(prev, event);
      paintRef.current.set(tabId, next);

      if (event.type === "text_delta" || event.type === "thinking_delta") {
        upsertPiBlocks(tabId, contentBlocksFromAgentSink(next));
        return;
      }

      if (event.type === "tool_started") {
        upsertPiBlocks(tabId, [{
          type: "tool_use",
          id: event.toolCallId,
          name: event.toolName,
          input: event.args,
          status: "running",
        }]);
        return;
      }

      if (event.type === "tool_finished") {
        const preview = event.error
          ? event.error
          : event.result === undefined
            ? ""
            : JSON.stringify(event.result);
        store._injectToolResult(tabId, event.toolCallId, preview, Boolean(event.error || event.denied || !event.ok));
        return;
      }

      if (event.type === "permission_requested") {
        usePermissionStore.getState().addPermission({
          id: event.requestId,
          tabId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          message: event.toolName,
          options: [
            { optionId: "allow", kind: "allow_once" },
            { optionId: "deny", kind: "reject_once" },
          ],
        });
        schedulePermissionTimeout(tabId, event.requestId, event.toolCallId, event.toolName);
        return;
      }

      if (
        event.type === "turn_finished"
        || event.type === "turn_failed"
        || event.type === "turn_cancelled"
      ) {
        if (event.type === "turn_failed") {
          store._appendAssistantError(tabId, event.error);
        }
        store._setStreaming(tabId, false);
        usePermissionStore.getState().clearTabPermissions(tabId);
        paintRef.current.set(tabId, emptyAgentEventPaintSink());
      }
    });

    return () => {
      offEvent();
    };
  }, []);
}
