import { useEffect } from "react";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { useChatStore } from "@/stores/chat-store";
import { usePermissionStore } from "@/stores/permission-store";
import { schedulePermissionTimeout } from "@/stores/permission-actions";
import { isAgentRuntime } from "@shared/agent/api";
import type { AgentEvent } from "@shared/agent/runtime";

function resolveAgentTabId(eventTabId: string): string | null {
  const store = useChatStore.getState();
  const tab = store.tabs.find((item) => (
    item.id === eventTabId && isAgentRuntime(item.runtime)
  ));
  return tab?.id ?? null;
}

/**
 * High-frequency delta types. Providers push one SSE chunk per token
 * (40–150 events/s); applying each directly drives the whole store +
 * React pipeline at that rate. Adjacent same-type deltas are merged and
 * flushed once per animation frame — pure append coalescing, zero
 * information loss beyond grouping within a frame.
 */
function isDeltaEvent(event: AgentEvent): boolean {
  return (
    event.type === "text_delta"
    || event.type === "thinking_delta"
    || event.type === "tool_progress"
  );
}

/** Safety flush for hidden windows: rAF never fires while document.hidden. */
const DELTA_FLUSH_FALLBACK_MS = 250;

type QueuedDelta =
  | { kind: "text_delta" | "thinking_delta"; event: AgentEvent }
  | { kind: "tool_progress"; event: AgentEvent };

const deltaQueues = new Map<string, QueuedDelta[]>();
let rafId: number | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

function flushDeltaQueues(): void {
  rafId = null;
  if (fallbackTimer != null) {
    clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
  if (deltaQueues.size === 0) return;
  const apply = useChatStore.getState()._applyAgentEvent;
  const batches = [...deltaQueues.entries()];
  deltaQueues.clear();
  for (const [tabId, queue] of batches) {
    for (const item of queue) {
      apply(tabId, item.event);
    }
  }
}

function scheduleDeltaFlush(): void {
  if (rafId != null) return;
  rafId = requestAnimationFrame(flushDeltaQueues);
  if (fallbackTimer == null) {
    fallbackTimer = setTimeout(flushDeltaQueues, DELTA_FLUSH_FALLBACK_MS);
  }
}

function queueDeltaEvent(tabId: string, event: AgentEvent): void {
  let queue = deltaQueues.get(tabId);
  if (!queue) {
    queue = [];
    deltaQueues.set(tabId, queue);
  }
  const last = queue[queue.length - 1];

  // Merge adjacent same-type deltas — order is preserved exactly; only
  // same-kind neighbours coalesce. tool_progress: latest text wins.
  if (last) {
    if (
      (event.type === "text_delta" || event.type === "thinking_delta")
      && last.kind === event.type
    ) {
      (last.event as { text: string }).text += (event as { text: string }).text;
      return;
    }
    if (
      event.type === "tool_progress"
      && last.kind === "tool_progress"
      && (last.event as { toolCallId?: unknown }).toolCallId
        === (event as { toolCallId?: unknown }).toolCallId
    ) {
      queue[queue.length - 1] = { kind: "tool_progress", event };
      return;
    }
  }
  queue.push({ kind: event.type as QueuedDelta["kind"], event });
}

export function useAgentEvents(): void {
  useEffect(() => {
    const offEvent = agentDesktop.onAgentEvent((event: AgentEvent) => {
      const tabId = resolveAgentTabId(event.tabId);
      if (!tabId) return;

      // Delta events are coalesced per frame; everything else flushes the
      // pending deltas first so ordering across kinds is preserved.
      if (isDeltaEvent(event)) {
        queueDeltaEvent(tabId, event);
        scheduleDeltaFlush();
        return;
      }
      flushDeltaQueues();

      useChatStore.getState()._applyAgentEvent(tabId, event);

      if (event.type === "usage_updated") {
        // Occupancy is the current window (grows with the chat). Spend is
        // session-cumulative from Pi totals. Zero / missing occupancy must
        // not wipe the last known fill.
        if (event.occupancyReset) {
          useChatStore.getState()._setContextTokens(tabId, null, {
            clearOccupancy: true,
            source: "usage_update",
            ...(typeof event.windowSize === "number" ? { windowSize: event.windowSize } : {}),
            ...(typeof event.costUsd === "number" ? { costUsd: event.costUsd } : {}),
            ...(event.breakdown ? { breakdown: event.breakdown } : {}),
          });
          return;
        }
        const occupancy = typeof event.inputTokens === "number" && event.inputTokens > 0
          ? event.inputTokens
          : undefined;
        if (
          occupancy !== undefined
          || typeof event.costUsd === "number"
          || typeof event.windowSize === "number"
          || event.breakdown
        ) {
          useChatStore.getState()._setContextTokens(tabId, occupancy, {
            source: "usage_update",
            ...(typeof event.windowSize === "number" ? { windowSize: event.windowSize } : {}),
            ...(typeof event.costUsd === "number" ? { costUsd: event.costUsd } : {}),
            ...(event.breakdown ? { breakdown: event.breakdown } : {}),
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
          args: event.args,
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

    return () => {
      offEvent();
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (fallbackTimer != null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      deltaQueues.clear();
    };
  }, []);
}
