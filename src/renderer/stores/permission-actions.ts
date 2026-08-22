import {
  isBashToolName,
} from "@/lib/terminal/ai-bridge";
import { findConversationToolUse } from "@/lib/chat/conversation-view";
import { useChangesStore } from "@/stores/changes-store";
import { usePermissionStore } from "@/stores/permission-store";
import { useChatStore } from "@/stores/chat-store";
import { usesProposedChange } from "@/components/modules/chat/tools/tool-meta";
import { createLogger } from "@/services/logger";
import { PERMISSION_UI_TIMEOUT_MS } from "../../shared/permissions/timeouts";

async function answerPermission(
  _tabId: string,
  permissionId: string,
  allow: boolean,
  _toolCallId?: string,
  _always?: boolean,
): Promise<void> {
  await window.electronAPI.agentResolvePermission({
    requestId: permissionId,
    decision: allow ? "allow" : "deny",
  });
}

const log = createLogger("permission-actions", "agent");

export { PERMISSION_UI_TIMEOUT_MS };

const permissionTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    skipApi = false,
  } = opts;

  clearPermissionTimer(permissionId);

  if (!skipApi) {
    log.debug("finalizePermissionDeny", { permissionId, toolCallId, toolName });
    await answerPermission(tabId, permissionId, false, toolCallId);
  }

  const permissionStore = usePermissionStore.getState();
  if (toolCallId) {
    permissionStore.markToolDenied(tabId, toolCallId);
    permissionStore.markToolResolved(tabId, toolCallId);
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
    const neverPersistAlways = n === "delete" || n === "move" || n === "literature-delete";
    if (!neverPersistAlways) {
      const isBash =
        isBashToolName(n) || n === "experiment-run" || /bash|shell|terminal|command/.test(n);
      if (isBash) {
        const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
        const pending = usePermissionStore.getState().permissions.find((p) => p.id === permissionId);
        const toolUseMsg = findConversationToolUse(tab?.conversation, toolCallId) ?? [
          ...(tab?.streamingMessage?.message?.content ?? []),
          ...(tab?.messages.flatMap((m) => m.message?.content ?? []) ?? []),
        ].find((b) => b.type === "tool_use" && b.id === toolCallId);
        const input = {
          ...(pending?.args ?? {}),
          ...((toolUseMsg?.input ?? {}) as Record<string, unknown>),
        };
        const command = String(input.command ?? input.cmd ?? "").trim();
        if (command) {
          const { bashAlwaysPatternFromCommand } = await import("../../shared/permissions/bash-allow-always");
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
  }
  await answerPermission(tabId, permissionId, true, toolCallId, always);

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

}
