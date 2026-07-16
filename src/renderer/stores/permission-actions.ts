import {
  handleBashPermissionDenied,
  isBashToolName,
  tryExecutePtyBashAfterPermission,
} from "@/lib/terminal/ai-bridge";
import { useChangesStore } from "@/stores/changes-store";
import { usePermissionStore } from "@/stores/permission-store";
import { useChatStore, type ContentBlock } from "@/stores/chat-store";
import { usesProposedChange } from "@/components/modules/chat/tools/tool-meta";
import { createLogger } from "@/services/logger";
import { PERMISSION_UI_TIMEOUT_MS } from "../../shared/permission-timeouts";

const log = createLogger("permission-actions");

export { PERMISSION_UI_TIMEOUT_MS };

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
    log.debug("finalizePermissionDeny", { permissionId, toolCallId, toolName });
    await window.electronAPI.chatAnswerPermission(permissionId, false, toolCallId);
  }

  const permissionStore = usePermissionStore.getState();
  if (toolCallId) {
    permissionStore.markToolDenied(tabId, toolCallId);
    permissionStore.markToolResolved(tabId, toolCallId);
    if (!hasToolResult(tabId, toolCallId)) {
      useChatStore.getState()._injectToolResult(tabId, toolCallId, reason, true);
    }
    const tn = (toolName || "").toLowerCase();
    if (isBashToolName(tn) && toolCallId) {
      const tabTools = useChatStore.getState().tabs.find((t) => t.id === tabId);
      const toolUseMsg = tabTools?.messages
        .flatMap((m) => m.message?.content ?? [])
        .find((b) => b.type === "tool_use" && b.id === toolCallId);
      handleBashPermissionDenied(
        tabId,
        toolCallId,
        tn,
        toolUseMsg?.input as Record<string, unknown> | undefined,
      );
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
  /** Persist tool into settings.toolAllowAlways + prefer allow_always option. */
  always?: boolean;
}) {
  const { tabId, permissionId, toolCallId, toolName, always } = opts;
  clearPermissionTimer(permissionId);

  log.debug("finalizePermissionAllow", { permissionId, toolCallId, toolName, always });
  if (always && toolName?.trim()) {
    const { useSettingsStore } = await import("@/stores/settings-store");
    const n = toolName.trim().toLowerCase();
    const isBash =
      isBashToolName(n) || n === "experiment-run" || /bash|shell|terminal|command/.test(n);
    if (isBash) {
      const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
      const toolUseMsg = [
        ...(tab?.streamingMessage?.message?.content ?? []),
        ...(tab?.messages.flatMap((m) => m.message?.content ?? []) ?? []),
      ].find((b) => b.type === "tool_use" && b.id === toolCallId);
      const input = (toolUseMsg?.input ?? {}) as Record<string, unknown>;
      const command = String(input.command ?? input.cmd ?? "").trim();
      if (command) {
        const { bashAlwaysPatternFromCommand } = await import("../../shared/bash-allow-always");
        const pattern = bashAlwaysPatternFromCommand(command);
        if (pattern) {
          const cur = useSettingsStore.getState().settings.bashAllowAlwaysPatterns ?? [];
          if (!cur.includes(pattern)) {
            await useSettingsStore.getState().updateSettings({
              bashAllowAlwaysPatterns: [...cur.map(String), pattern],
            });
          }
        }
      }
    } else {
      const cur = useSettingsStore.getState().settings.toolAllowAlways ?? [];
      if (!cur.some((t) => String(t).trim().toLowerCase() === n)) {
        await useSettingsStore.getState().updateSettings({
          toolAllowAlways: [...cur.map(String), n],
        });
      }
    }
  }
  await window.electronAPI.chatAnswerPermission(permissionId, true, toolCallId, {
    always: Boolean(always),
  });

  const permissionStore = usePermissionStore.getState();
  if (toolCallId) {
    permissionStore.markToolResolved(tabId, toolCallId);
    permissionStore.clearPermissionsForTool(tabId, toolCallId);
  } else {
    permissionStore.clearPermission(permissionId);
  }
  if (usesProposedChange(toolName || "") && toolCallId) {
    useChangesStore.getState().removeChange(toolCallId);
  }

  if (toolCallId && isBashToolName(toolName || "")) {
    const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
    const toolUseMsg = [
      ...(tab?.streamingMessage?.message?.content ?? []),
      ...(tab?.messages.flatMap((m) => m.message?.content ?? []) ?? []),
    ].find((b) => b.type === "tool_use" && b.id === toolCallId);
    tryExecutePtyBashAfterPermission(
      tabId,
      toolCallId,
      toolName || "bash",
      toolUseMsg?.input as Record<string, unknown> | undefined,
    );
  }
}
