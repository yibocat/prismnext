import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldIcon,
  TerminalIcon,
  FileEditIcon,
  FileDiffIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { i18n } from "@/lib/i18n";
import { useChatStore, type ContentBlock } from "@/stores/chat-store";
import { usePermissionStore, type PendingPermission } from "@/stores/permission-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  resolvePermissionMode,
  shouldPromptForPermission,
  type PermissionMode,
} from "@shared/permission-modes";
import { finalizePermissionAllow, finalizePermissionDeny } from "@/stores/permission-actions";
import { isBashToolName } from "@/lib/terminal/ai-bridge";
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

/** Whether the composer gate should show for this permission under the current mode. */
export function shouldShowPermissionGate(
  permissionMode: string | undefined,
  toolName: string,
): boolean {
  const mode = resolvePermissionMode(permissionMode);
  const meta = getToolMeta(toolName);
  if (meta.confirmUx === "none" || meta.confirmUx === "inline") return false;
  if (mode === "ask") return true;
  if (mode === "edit_auto") return shouldPromptForPermission(mode, toolName);
  // Full auto / readonly: never show composer gate (readonly denies in main).
  return false;
}

function pickActivePermission(
  tabId: string,
  permissions: PendingPermission[],
): PendingPermission | undefined {
  const tabPerms = permissions.filter((p) => p.tabId === tabId);
  if (tabPerms.length === 0) return undefined;
  const withToolId = tabPerms.filter((p) => p.toolCallId);
  if (withToolId.length === 1) return withToolId[0];
  return withToolId[0] ?? tabPerms[0];
}

function permissionSummary(
  permission: PendingPermission,
  toolUse: ContentBlock | undefined,
  toolName: string,
): { label: string; detail: string } {
  const n = toolName.toLowerCase();
  const input = toolUse?.input ?? {};
  const meta = getToolMeta(n);
  const awaiting = i18n.t("dialogs.permission.awaiting");

  if (meta.confirmUx === "command") {
    const command =
      param(input, "command")
      || (input as Record<string, unknown>)._title as string
      || toolUse?.title
      || permission.message
      || "";
    return {
      label: i18n.t("dialogs.permission.shellCommand"),
      detail: truncate(command, 80) || awaiting,
    };
  }

  if (meta.confirmUx === "patch") {
    const paths = extractPatchTargetPaths(input);
    if (paths.length > 1) {
      return {
        label: i18n.t("dialogs.permission.applyPatch"),
        detail: i18n.t("dialogs.permission.filesCount", { count: paths.length }),
      };
    }
    const path = paths[0] || param(input, "file_path", "filePath") || param(input, "path") || "";
    return {
      label: i18n.t("dialogs.permission.applyPatch"),
      detail: path ? basename(path) : truncate(permission.message, 80) || awaiting,
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

    if (n === "delete") {
      return { label: i18n.t("dialogs.permission.deleteFile"), detail: fileName };
    }
    if (n === "move") {
      const src = param(input, "source_path", "sourcePath") || filePath;
      const dst = param(input, "destination_path", "destinationPath") || "";
      return {
        label: i18n.t("dialogs.permission.moveFile"),
        detail: dst ? `${basename(src)} → ${basename(dst)}` : basename(src),
      };
    }
    return {
      label: n.startsWith("write")
        ? i18n.t("dialogs.permission.writeFile")
        : i18n.t("dialogs.permission.editFile"),
      detail: `${fileName}${deltaLabel}`,
    };
  }

  return {
    label: i18n.t("dialogs.permission.required"),
    detail: truncate(permission.message, 80) || awaiting,
  };
}

function PermissionIcon({ toolName }: { toolName: string }) {
  const n = toolName.toLowerCase();
  if (n === "bash") return <TerminalIcon className="size-3.5 shrink-0 text-warning" />;
  if (n === "apply_patch") return <FileDiffIcon className="size-3.5 shrink-0 text-info" />;
  if (n === "delete") return <FileEditIcon className="size-3.5 shrink-0 text-destructive" />;
  if (n === "move") return <FileEditIcon className="size-3.5 shrink-0 text-info" />;
  if (n.startsWith("edit") || n.startsWith("write")) {
    return <FileEditIcon className="size-3.5 shrink-0 text-info" />;
  }
  return <ShieldIcon className="size-3.5 shrink-0 text-primary" />;
}

export function usePermissionGateOpen(): boolean {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const permission = usePermissionStore((s) =>
    pickActivePermission(activeTabId, s.permissions),
  );
  if (!permission) return false;
  const toolName = permission.toolName || "";
  return shouldShowPermissionGate(permissionMode, toolName);
}

/** @deprecated Use usePermissionGateOpen */
export const usePermissionAskOpen = usePermissionGateOpen;

export function PermissionGatePanel() {
  const { t, i18n: i18nInstance } = useTranslation();
  const activeTabId = useChatStore((s) => s.activeTabId);
  const streamTick = useChatStore((s) => s.streamTick);
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const permission = usePermissionStore((s) =>
    pickActivePermission(activeTabId, s.permissions),
  );
  const [resolving, setResolving] = useState(false);

  const toolUse = useMemo(
    () => (permission ? findToolUseBlock(activeTabId, permission.toolCallId) : undefined),
    [activeTabId, permission, streamTick],
  );

  const toolName = permission?.toolName || toolUse?.name || "";
  const show = !!permission && shouldShowPermissionGate(permissionMode, toolName);

  const summary = useMemo(
    () => (permission ? permissionSummary(permission, toolUse, toolName) : null),
    [permission, toolUse, toolName, i18nInstance.language],
  );

  const allow = useCallback(async (always = false) => {
    if (!permission || resolving) return;
    setResolving(true);
    try {
      await finalizePermissionAllow({
        tabId: activeTabId,
        permissionId: permission.id,
        toolCallId: permission.toolCallId,
        toolName,
        always,
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

  const mode = resolvePermissionMode(permissionMode) as PermissionMode;

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
        {mode === "edit_auto" && (
          <span className="text-muted-foreground/70"> · {t("dialogs.permission.editAuto")}</span>
        )}
        {mode === "auto" && (
          <span className="text-muted-foreground/70"> · {t("dialogs.permission.autoMode")}</span>
        )}
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
          {t("dialogs.permission.deny")}
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-2 py-1 text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          onClick={() => void allow(true)}
          disabled={resolving || !toolName}
          title={
            toolName
              ? isBashToolName(toolName) || toolName === "experiment-run"
                ? t("dialogs.permission.alwaysBash")
                : t("dialogs.permission.alwaysTool", { tool: toolName })
              : t("dialogs.permission.alwaysGeneric")
          }
        >
          {t("dialogs.permission.always")}
        </button>
        <button
          type="button"
          className={cn(
            "rounded px-2 py-1 font-medium text-primary transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          onClick={() => void allow(false)}
          disabled={resolving}
        >
          {t("dialogs.permission.allow")}
        </button>
      </div>
    </div>
  );
}

/** @deprecated Use PermissionGatePanel */
export const PermissionAskPanel = PermissionGatePanel;
