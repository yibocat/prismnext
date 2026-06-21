import { useCallback, useState } from "react";
import { useChatStore } from "@/stores/chat-store";
import {
  usePermissionStore,
  type PendingPermission,
} from "@/stores/permission-store";
import { finalizePermissionAllow, finalizePermissionDeny } from "@/stores/permission-actions";

export interface UseToolPermissionResult {
  permission: PendingPermission | undefined;
  isAwaitingPermission: boolean;
  isToolDenied: boolean;
  allow: () => Promise<void>;
  deny: () => Promise<void>;
  resolving: boolean;
}

export function useToolPermission(
  toolUseId: string,
  toolName: string,
): UseToolPermissionResult {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const permission = usePermissionStore((s) =>
    s.getPermissionForTool(activeTabId, toolUseId),
  );
  const isToolDenied = usePermissionStore((s) =>
    s.isToolDenied(activeTabId, toolUseId),
  );

  const [resolving, setResolving] = useState(false);
  const isAwaitingPermission = !!permission;

  const allow = useCallback(async () => {
    if (!permission || resolving) return;
    setResolving(true);
    try {
      await finalizePermissionAllow({
        tabId: activeTabId,
        permissionId: permission.id,
        toolCallId: toolUseId,
        toolName,
      });
    } finally {
      setResolving(false);
    }
  }, [permission, resolving, activeTabId, toolUseId, toolName]);

  const deny = useCallback(async () => {
    if (!permission || resolving) return;
    setResolving(true);
    try {
      await finalizePermissionDeny({
        tabId: activeTabId,
        permissionId: permission.id,
        toolCallId: toolUseId,
        toolName,
      });
    } finally {
      setResolving(false);
    }
  }, [permission, resolving, activeTabId, toolUseId, toolName]);

  return {
    permission,
    isAwaitingPermission,
    isToolDenied,
    allow,
    deny,
    resolving,
  };
}
