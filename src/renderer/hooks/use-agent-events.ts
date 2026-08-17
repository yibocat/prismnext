import { useEffect } from "react";
import { useChatStore } from "@/stores/chat-store";
import { usePermissionStore } from "@/stores/permission-store";
import { schedulePermissionTimeout } from "@/stores/permission-actions";
import { isAgentRuntime } from "@shared/agent-api";
import type { AgentEvent } from "@shared/agent-runtime";

function resolveAgentTabId(eventTabId: string): string | null {
  const store = useChatStore.getState();
  const tab = store.tabs.find((item) => (
    item.id === eventTabId && isAgentRuntime(item.runtime)
  ));
  return tab?.id ?? null;
}

export function useAgentEvents(): void {
  useEffect(() => {
    const offEvent = window.electronAPI.onAgentEvent((event: AgentEvent) => {
      const tabId = resolveAgentTabId(event.tabId);
      if (!tabId) return;
      useChatStore.getState()._applyAgentEvent(tabId, event);

      if (event.type === "usage_updated") {
        // Live context ring: Pi reports input tokens (context occupancy) and
        // session spend. Store them so the indicator updates per turn. Missing
        // input tokens must not clear the previously known occupancy.
        if (typeof event.inputTokens === "number" || typeof event.costUsd === "number") {
          useChatStore.getState()._setContextTokens(tabId, event.inputTokens, {
            source: "usage_update",
            ...(typeof event.costUsd === "number" ? { costUsd: event.costUsd } : {}),
          });
        }
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
        usePermissionStore.getState().clearTabPermissions(tabId);
      }
    });

    return offEvent;
  }, []);
}
