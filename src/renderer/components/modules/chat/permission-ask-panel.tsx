import { useCallback, useMemo, useState } from "react";
import {
  ShieldIcon,
  TerminalIcon,
  FileEditIcon,
  FileDiffIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore, type ContentBlock } from "@/stores/chat-store";
import { usePermissionStore, type PendingPermission } from "@/stores/permission-store";
import { useSettingsStore } from "@/stores/settings-store";
import { resolvePermissionMode } from "@shared/permission-modes";
import { finalizePermissionAllow, finalizePermissionDeny } from "@/stores/permission-actions";
import { getToolMeta, extractPatchTargetPaths } from "./tools/tool-meta";
import { param } from "./tools/shared";

function findToolUseBlock(tabId: string, toolCallId?: string): ContentBlock | undefined {
  if (!toolCallId) return undefined;
  const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return undefined;

  const scan = (blocks: ContentBlock[] | undefined) =>
    blocks?.find((b) => b.type === "tool_use" && b.id === toolCallId);

  for (const msg of tab.messages) {
    const hit = scan(msg.message?.content);
    if (hit) return hit;
  }
  return scan(tab.streamingMessage?.message?.content);
}

function truncate(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

function permissionSummary(
  permission: PendingPermission,
  toolUse: ContentBlock | undefined,
  toolName: string,
): { label: string; detail: string } {
  const n = toolName.toLowerCase();
  const input = toolUse?.input ?? {};
  const meta = getToolMeta(n);

  if (meta.confirmUx === "command") {
    const command =
      param(input, "command")
      || (input as Record<string, unknown>)._title as string
      || toolUse?.title
      || permission.message
      || "";
    return {
      label: "Shell command",
      detail: truncate(command, 80) || "Awaiting approval",
    };
  }

  if (meta.confirmUx === "patch") {
    const paths = extractPatchTargetPaths(input);
    if (paths.length > 1) {
      return { label: "Apply patch", detail: `${paths.length} files` };
    }
    const path = paths[0] || param(input, "file_path", "filePath") || param(input, "path") || "";
    return {
      label: "Apply patch",
      detail: path ? basename(path) : truncate(permission.message, 80) || "Awaiting approval",
    };
  }

  if (meta.confirmUx === "diff") {
    const filePath =
      param(input, "file_path", "filePath")
      || param(input, "path")
      || "";
    const oldStr = param(input, "old_string", "oldString") ?? "";
    const newStr =
      param(input, "new_string", "newString")
      ?? param(input, "content")
      ?? "";
    const delta = newStr.length - oldStr.length;
    const fileName = filePath ? basename(filePath) : "file";
    const deltaLabel =
      oldStr || newStr
        ? ` · ${delta >= 0 ? "+" : ""}${delta} chars`
        : "";
    return {
      label: n.startsWith("write") ? "Write file" : "Edit file",
      detail: `${fileName}${deltaLabel}`,
    };
  }

  return {
    label: "Permission required",
    detail: truncate(permission.message, 80) || "Awaiting approval",
  };
}

function PermissionIcon({ toolName }: { toolName: string }) {
  const n = toolName.toLowerCase();
  if (n === "bash") return <TerminalIcon className="size-3.5 shrink-0 text-warning" />;
  if (n === "patch" || n === "apply_patch") return <FileDiffIcon className="size-3.5 shrink-0 text-info" />;
  if (n.startsWith("edit") || n.startsWith("write")) {
    return <FileEditIcon className="size-3.5 shrink-0 text-info" />;
  }
  return <ShieldIcon className="size-3.5 shrink-0 text-primary" />;
}

export function usePermissionAskOpen(): boolean {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const permission = usePermissionStore((s) => {
    const tabPerms = s.permissions.filter((p) => p.tabId === activeTabId);
    if (tabPerms.length === 0) return undefined;
    if (tabPerms.length === 1) return tabPerms[0];
    return tabPerms.find((p) => p.toolCallId) ?? tabPerms[0];
  });
  return resolvePermissionMode(permissionMode) === "ask" && !!permission;
}

export function PermissionAskPanel() {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const streamTick = useChatStore((s) => s.streamTick);
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const permission = usePermissionStore((s) => {
    const tabPerms = s.permissions.filter((p) => p.tabId === activeTabId);
    if (tabPerms.length === 0) return undefined;
    if (tabPerms.length === 1) return tabPerms[0];
    return tabPerms.find((p) => p.toolCallId) ?? tabPerms[0];
  });
  const [resolving, setResolving] = useState(false);

  const show = resolvePermissionMode(permissionMode) === "ask" && !!permission;

  const toolUse = useMemo(
    () => (permission ? findToolUseBlock(activeTabId, permission.toolCallId) : undefined),
    [activeTabId, permission, streamTick],
  );

  const toolName = permission?.toolName || toolUse?.name || "";
  const summary = useMemo(
    () => (permission ? permissionSummary(permission, toolUse, toolName) : null),
    [permission, toolUse, toolName],
  );

  const allow = useCallback(async () => {
    if (!permission || resolving) return;
    setResolving(true);
    try {
      await finalizePermissionAllow({
        tabId: activeTabId,
        permissionId: permission.id,
        toolCallId: permission.toolCallId,
        toolName,
      });
    } finally {
      setResolving(false);
    }
  }, [permission, resolving, activeTabId, toolName]);

  const deny = useCallback(async () => {
    if (!permission || resolving) return;
    setResolving(true);
    try {
      await finalizePermissionDeny({
        tabId: activeTabId,
        permissionId: permission.id,
        toolCallId: permission.toolCallId,
        toolName,
      });
    } finally {
      setResolving(false);
    }
  }, [permission, resolving, activeTabId, toolName]);

  if (!show || !permission || !summary) return null;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-t-lg border border-b-0 border-border bg-card px-3 py-2",
        "text-[length:var(--font-chat-meta)]",
        "animate-in slide-in-from-bottom-2 fade-in duration-200",
      )}
    >
      <PermissionIcon toolName={toolName} />

      <p className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{summary.label}</span>
        <span className="text-muted-foreground"> · {summary.detail}</span>
      </p>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className={cn(
            "rounded px-2 py-1 text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          onClick={deny}
          disabled={resolving}
        >
          Deny
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-2 py-1 font-medium text-primary transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          onClick={allow}
          disabled={resolving}
        >
          Allow
        </button>
      </div>
    </div>
  );
}
