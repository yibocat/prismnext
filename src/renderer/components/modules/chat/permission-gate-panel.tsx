import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldIcon,
  TerminalIcon,
  FileEditIcon,
  FileDiffIcon,
  ChevronDownIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { i18n } from "@/lib/i18n";
import { useChatStore, type ContentBlock } from "@/stores/chat-store";
import { usePermissionStore, type PendingPermission } from "@/stores/permission-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  resolvePermissionMode,
  shouldPromptForPermission,
  extractPermissionToolName,
} from "@shared/permission-modes";
import { finalizePermissionAllow, finalizePermissionDeny } from "@/stores/permission-actions";
import { isBashToolName } from "@/lib/terminal/ai-bridge";
import { getToolMeta, extractPatchTargetPaths } from "./tools/tool-meta";
import { param } from "./tools/shared";
import { ComposerChromeCard } from "./composer-chrome-card";

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
  if (meta.confirmUx === "none") return false;
  if (mode === "ask") return true;
  if (mode === "edit_auto") return shouldPromptForPermission(mode, toolName);
  return false;
}

/** Tool row should defer Allow/Deny to the composer permission card. */
export function isComposerHostedPermission(
  permissionMode: string | undefined,
  toolName: string,
  isAwaitingPermission: boolean,
): boolean {
  return isAwaitingPermission && shouldShowPermissionGate(permissionMode, toolName);
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

  if (n === "delete") {
    const path = param(input, "file_path", "filePath") || param(input, "path") || "";
    return {
      label: i18n.t("dialogs.permission.deleteFile"),
      detail: path ? basename(path) : truncate(permission.message, 80) || awaiting,
    };
  }

  if (n === "move") {
    const src = param(input, "source_path", "sourcePath") || param(input, "path") || "";
    const dst = param(input, "destination_path", "destinationPath") || "";
    return {
      label: i18n.t("dialogs.permission.moveFile"),
      detail: dst
        ? `${basename(src)} → ${basename(dst)}`
        : basename(src) || truncate(permission.message, 80) || awaiting,
    };
  }

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

/** Compact expand body: full path + short content peek. Nothing else. */
function permissionExpandPeek(
  permission: PendingPermission,
  toolUse: ContentBlock | undefined,
  toolName: string,
): { path: string; preview: string } {
  const n = toolName.toLowerCase();
  const input = toolUse?.input ?? {};
  const meta = getToolMeta(n);

  if (n === "delete") {
    const path =
      param(input, "file_path", "filePath")
      || param(input, "path")
      || permission.message.trim();
    return { path, preview: "" };
  }

  if (n === "move") {
    const src =
      param(input, "source_path", "sourcePath")
      || param(input, "source", "src")
      || param(input, "path")
      || "";
    const dst =
      param(input, "destination_path", "destinationPath")
      || param(input, "destination", "dst")
      || "";
    if (src || dst) return { path: dst ? `${src} → ${dst}` : src, preview: "" };
    return { path: permission.message.trim(), preview: "" };
  }

  if (meta.confirmUx === "command") {
    const command =
      param(input, "command")
      || (input as Record<string, unknown>)._title as string
      || toolUse?.title
      || permission.message
      || "";
    return { path: "", preview: truncate(command, 220) };
  }

  if (meta.confirmUx === "patch") {
    const paths = extractPatchTargetPaths(input);
    const path =
      paths.length === 1
        ? paths[0]!
        : paths.length > 1
          ? paths.map(basename).join(", ")
          : param(input, "file_path", "filePath") || param(input, "path") || "";
    const patch = param(input, "patch") || param(input, "content") || "";
    return { path, preview: truncate(patch, 220) };
  }

  if (meta.confirmUx === "diff") {
    const path =
      param(input, "file_path", "filePath")
      || param(input, "path")
      || "";
    const newStr =
      param(input, "new_string", "newString")
      ?? param(input, "content")
      ?? "";
    const oldStr = param(input, "old_string", "oldString") ?? "";
    const preview = truncate(newStr || oldStr, 220);
    return { path, preview };
  }

  return { path: "", preview: truncate(permission.message, 220) };
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

function useActivePermissionGate() {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const streamTick = useChatStore((s) => s.streamTick);
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const permission = usePermissionStore((s) =>
    pickActivePermission(activeTabId, s.permissions),
  );

  const toolUse = useMemo(
    () => (permission ? findToolUseBlock(activeTabId, permission.toolCallId) : undefined),
    [activeTabId, permission, streamTick],
  );

  const toolName = useMemo(() => {
    const fromPerm = permission?.toolName?.trim();
    if (fromPerm) return fromPerm.toLowerCase();
    const fromBlock = toolUse?.name?.trim();
    if (fromBlock) return fromBlock.toLowerCase();
    if (permission) {
      return extractPermissionToolName({
        message: permission.message,
        toolName: permission.toolName,
      });
    }
    return "";
  }, [permission, toolUse]);

  const show = !!permission && shouldShowPermissionGate(permissionMode, toolName);
  const summary = useMemo(
    () => (permission && show ? permissionSummary(permission, toolUse, toolName) : null),
    [permission, show, toolUse, toolName, i18n.language],
  );

  return { permission, toolName, show, summary, toolUse };
}

export function usePermissionGateOpen(): boolean {
  return useActivePermissionGate().show;
}

export function usePermissionGatePeek(): string | null {
  const { show, summary } = useActivePermissionGate();
  if (!show || !summary) return null;
  const detail = truncate(summary.detail, 48);
  return detail ? `${summary.label} · ${detail}` : summary.label;
}

/** @deprecated Use usePermissionGateOpen */
export const usePermissionAskOpen = usePermissionGateOpen;

/**
 * One-line permission card in the composer chrome stack.
 * Whole card toggles expand; expanded shows path + short content peek only.
 */
export function PermissionGatePanel() {
  const { t } = useTranslation();
  const activeTabId = useChatStore((s) => s.activeTabId);
  const { permission, toolName, show, summary, toolUse } = useActivePermissionGate();
  const [resolving, setResolving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const peek = useMemo(
    () => (permission ? permissionExpandPeek(permission, toolUse, toolName) : null),
    [permission, toolUse, toolName],
  );

  useEffect(() => {
    setExpanded(false);
  }, [permission?.id]);

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

  if (!show || !permission || !summary || !peek) return null;

  const alwaysLabel = toolName
    ? isBashToolName(toolName) || toolName === "experiment-run"
      ? t("dialogs.permission.alwaysBash")
      : t("dialogs.permission.alwaysTool", { tool: toolName })
    : t("dialogs.permission.alwaysGeneric");

  const hasExpandBody = !!(peek.path || peek.preview);

  return (
    <ComposerChromeCard
      className={cn(
        "overflow-hidden transition-colors",
        hasExpandBody && "cursor-pointer hover:bg-muted",
      )}
      onClick={() => {
        if (hasExpandBody) setExpanded((v) => !v);
      }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[length:var(--font-chat-meta)]">
        <PermissionIcon toolName={toolName} />
        <span className="min-w-0 flex-1 truncate text-left">
          <span className="font-medium text-foreground">{summary.label}</span>
          <span className="text-muted-foreground"> · {summary.detail}</span>
        </span>
        {hasExpandBody ? (
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded ? "rotate-0" : "-rotate-90",
            )}
            aria-hidden
          />
        ) : null}
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={cn(
              "rounded px-1.5 py-0.5 text-muted-foreground transition-colors",
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
              "rounded px-1.5 py-0.5 font-medium text-primary transition-colors",
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

      {expanded && hasExpandBody ? (
        <div className="space-y-1.5 border-t border-border px-2.5 py-2">
          {peek.path ? (
            <p className="break-all font-mono text-[length:var(--font-code)] text-muted-foreground">
              {peek.path}
            </p>
          ) : null}
          {peek.preview ? (
            <p className="line-clamp-3 break-all font-mono text-[length:var(--font-code)] text-muted-foreground">
              {peek.preview}
            </p>
          ) : null}
          <div
            className="flex justify-end"
            onClick={(e) => e.stopPropagation()}
          >
            <Hint label={alwaysLabel}>
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-0.5 text-[length:var(--font-chat-meta)] text-muted-foreground transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
                onClick={() => void allow(true)}
                disabled={resolving || !toolName}
              >
                {t("dialogs.permission.always")}
              </button>
            </Hint>
          </div>
        </div>
      ) : null}
    </ComposerChromeCard>
  );
}

/** @deprecated Use PermissionGatePanel */
export const PermissionAskPanel = PermissionGatePanel;
