import { useChatStore, type ContentBlock } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
import { usePermissionStore } from "@/stores/permission-store";
import { usesProposedChange } from "@/components/modules/chat/tools/tool-meta";

/** Keep in sync with main `PERMISSION_TIMEOUT_MS`. */
export const PERMISSION_UI_TIMEOUT_MS = 120_000;

const permissionTimers = new Map<string, ReturnType<typeof setTimeout>>();

function hasToolResult(tabId: string, toolUseId: string): boolean {
  const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return false;

  const scan = (blocks: ContentBlock[] | undefined) =>
    blocks?.some((b) => b.type === "tool_result" && b.tool_use_id === toolUseId);

  for (const msg of tab.messages) {
    if (scan(msg.message?.content)) return true;
  }
  return scan(tab.streamingMessage?.message?.content) ?? false;
}

export function clearPermissionTimer(permissionId: string) {
  const timer = permissionTimers.get(permissionId);
  if (timer) {
    clearTimeout(timer);
    permissionTimers.delete(permissionId);
  }
}

export function schedulePermissionTimeout(
  tabId: string,
  permissionId: string,
  toolCallId?: string,
  toolName?: string,
) {
  clearPermissionTimer(permissionId);
  permissionTimers.set(
    permissionId,
    setTimeout(() => {
      permissionTimers.delete(permissionId);
      const pending = usePermissionStore
        .getState()
        .permissions.find((p) => p.id === permissionId);
      if (!pending) return;
      void finalizePermissionDeny({
        tabId,
        permissionId,
        toolCallId: toolCallId || pending.toolCallId,
        toolName: toolName || pending.toolName,
        reason: "Permission timed out",
        skipApi: true,
      });
    }, PERMISSION_UI_TIMEOUT_MS),
  );
}

export async function finalizePermissionDeny(opts: {
  tabId: string;
  permissionId: string;
  toolCallId?: string;
  toolName?: string;
  reason?: string;
  skipApi?: boolean;
}) {
  const {
    tabId,
    permissionId,
    toolCallId,
    toolName,
    reason = "Permission denied",
    skipApi = false,
  } = opts;

  clearPermissionTimer(permissionId);

  if (!skipApi) {
    await window.electronAPI.chatAnswerPermission(permissionId, false);
  }

  const permissionStore = usePermissionStore.getState();
  if (toolCallId) {
    permissionStore.markToolDenied(tabId, toolCallId);
    permissionStore.markToolResolved(tabId, toolCallId);
    if (!hasToolResult(tabId, toolCallId)) {
      useChatStore.getState()._injectToolResult(tabId, toolCallId, reason, true);
    }
    if (usesProposedChange(toolName || "")) {
      await useChangesStore.getState().rejectChange(toolCallId);
    }
  }
  permissionStore.clearPermission(permissionId);
}

export async function finalizePermissionAllow(opts: {
  tabId: string;
  permissionId: string;
  toolCallId?: string;
  toolName?: string;
}) {
  const { tabId, permissionId, toolCallId, toolName } = opts;
  clearPermissionTimer(permissionId);
  await window.electronAPI.chatAnswerPermission(permissionId, true);

  const permissionStore = usePermissionStore.getState();
  if (toolCallId) {
    permissionStore.markToolResolved(tabId, toolCallId);
  }
  permissionStore.clearPermission(permissionId);
  if (usesProposedChange(toolName || "") && toolCallId) {
    useChangesStore.getState().removeChange(toolCallId);
  }
}
