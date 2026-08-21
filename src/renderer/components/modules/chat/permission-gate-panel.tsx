import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
  ShieldIcon,
  TerminalIcon,
  FileEditIcon,
  FileDiffIcon,
  ChevronDownIcon,
  CornerDownLeftIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/hint";
import { i18n } from "@/lib/i18n";
import { findConversationToolUse } from "@/lib/chat/conversation-view";
import { useChatStore, type ContentBlock } from "@/stores/chat-store";
import { pickActivePermission, usePermissionStore, type PendingPermission } from "@/stores/permission-store";
import { projectRootForSession } from "@/stores/workbench-store";
import { useDocumentStore } from "@/stores/document-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  extractPermissionToolName,
  buildPermissionRulesFromSettings,
} from "@shared/permission-modes";
import {
  resolveSmartPermissionAction,
  type SmartPermissionContext,
  type PermissionRulesConfig,
} from "@shared/smart-permission-policy";
import { finalizePermissionAllow, finalizePermissionDeny } from "@/stores/permission-actions";
import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { isBashToolName } from "@/lib/terminal/ai-bridge";
import { getToolMeta, extractPatchTargetPaths } from "./tools/tool-meta";
import { param } from "./tools/shared";
import { ComposerChromeCard } from "./composer-chrome-card";

function findToolUseBlock(tabId: string, toolCallId?: string): ContentBlock | undefined {
  if (!toolCallId) return undefined;
  const tab = useChatStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return undefined;

  const fromConversation = findConversationToolUse(tab.conversation, toolCallId);
  if (fromConversation) return fromConversation;

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

/** Middle-ellipsis truncate for long paths (Cursor-style one-liner). */
function truncateMiddle(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${normalized.slice(0, head)}…${normalized.slice(-tail)}`;
}

/** Delete / move — path is the whole story; no expand preview needed. */
export function isSimplePathPermissionGate(toolName: string): boolean {
  const n = toolName.toLowerCase();
  return n === "delete" || n === "move";
}

function basename(path: string): string {
  return path.split("/").pop() || path;
}

export function buildToolSmartPermissionContext(
  toolUse: ContentBlock,
  projectRoot: string | null,
): Omit<SmartPermissionContext, "toolName"> {
  const input = toolUse.input ?? {};
  return {
    projectRoot,
    filePath: param(input, "file_path", "filePath") || param(input, "path") || null,
    sourcePath:
      param(input, "source_path", "sourcePath")
      || param(input, "source", "src")
      || null,
    destinationPath:
      param(input, "destination_path", "destinationPath")
      || param(input, "destination", "dst")
      || null,
    bashCommand:
      param(input, "command")
      || (toolUse.input as Record<string, unknown>)?._title as string
      || toolUse.title
      || null,
    bashCwd: param(input, "workdir") || param(input, "cwd") || projectRoot,
  };
}

/** Whether the composer gate should show for this permission under smart policy. */
export function shouldShowPermissionGate(
  _permissionMode: string | undefined,
  toolName: string,
  ctx?: Omit<SmartPermissionContext, "toolName">,
  rules?: PermissionRulesConfig,
): boolean {
  if (!toolName) return false;
  return resolveSmartPermissionAction({ toolName, ...ctx }, rules) === "prompt";
}

/** Tool row should defer Allow/Deny to the composer permission card. */
export function isComposerHostedPermission(
  _permissionMode: string | undefined,
  toolName: string,
  isAwaitingPermission: boolean,
  ctx?: Omit<SmartPermissionContext, "toolName">,
  rules?: PermissionRulesConfig,
): boolean {
  return isAwaitingPermission && shouldShowPermissionGate(undefined, toolName, ctx, rules);
}

/**
 * Subscribe only to the 5 permission-rule fields (shallow) instead of the whole
 * settings object — theme/model/etc. changes must not re-render every tool widget.
 */
function usePermissionRulesConfig(): PermissionRulesConfig {
  const inputs = useSettingsStore(
    useShallow((s) => [
      s.settings.permissionAllowedPaths,
      s.settings.permissionAllowRules,
      s.settings.permissionDenyRules,
      s.settings.bashAllowAlwaysPatterns,
      s.settings.toolAllowAlways,
    ] as const),
  );
  return useMemo(
    () =>
      buildPermissionRulesFromSettings({
        permissionAllowedPaths: inputs[0],
        permissionAllowRules: inputs[1],
        permissionDenyRules: inputs[2],
        bashAllowAlwaysPatterns: inputs[3],
        toolAllowAlways: inputs[4],
      }),
    [inputs],
  );
}

export function useComposerHostedPermission(
  toolUse: ContentBlock,
  toolName: string,
  isAwaitingPermission: boolean,
): boolean {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeTabId = useChatStore((s) => s.activeTabId);
  const rules = usePermissionRulesConfig();
  const sessionRoot = projectRootForSession(activeTabId, projectRoot);
  const ctx = useMemo(
    () => buildToolSmartPermissionContext(toolUse, sessionRoot),
    [toolUse, sessionRoot],
  );
  return isComposerHostedPermission(undefined, toolName, isAwaitingPermission, ctx, rules);
}

function permissionInput(
  permission: PendingPermission,
  toolUse: ContentBlock | undefined,
): Record<string, unknown> {
  return {
    ...(permission.args ?? {}),
    ...(toolUse?.input && typeof toolUse.input === "object" ? toolUse.input : {}),
  };
}

function permissionSummary(
  permission: PendingPermission,
  toolUse: ContentBlock | undefined,
  toolName: string,
): { label: string; detail: string } {
  const n = toolName.toLowerCase();
  const input = permissionInput(permission, toolUse);
  const meta = getToolMeta(n);
  const awaiting = i18n.t("dialogs.permission.awaiting");

  if (n === "delete") {
    const path = param(input, "file_path", "filePath") || param(input, "path") || "";
    return {
      label: i18n.t("dialogs.permission.actionDelete"),
      detail: path ? truncateMiddle(path, 120) : truncate(permission.message, 80) || awaiting,
    };
  }

  if (n === "move") {
    const src = param(input, "source_path", "sourcePath") || param(input, "path") || "";
    const dst = param(input, "destination_path", "destinationPath") || "";
    const pathLine = dst ? `${src} → ${dst}` : src;
    return {
      label: i18n.t("dialogs.permission.actionMove"),
      detail: pathLine ? truncateMiddle(pathLine, 120) : truncate(permission.message, 80) || awaiting,
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
  const input = permissionInput(permission, toolUse);
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

export type PermissionGateState = {
  permission: PendingPermission | undefined;
  toolName: string;
  show: boolean;
  summary: { label: string; detail: string } | null;
  toolUse: ContentBlock | undefined;
  /** One-line label for the collapsed chrome-stack card. */
  peekLabel: string | null;
};

/**
 * Single subscription for the composer permission card. Call ONCE in
 * composer-chrome-stack and pass the result down — do not call per consumer.
 */
export function usePermissionGateState(): PermissionGateState {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const sessionRoot = projectRootForSession(activeTabId, projectRoot);
  const rules = usePermissionRulesConfig();
  const permission = usePermissionStore((s) =>
    pickActivePermission(activeTabId, s.permissions),
  );

  // Only subscribe to streamTick while a permission card is active — avoids
  // re-rendering the composer chrome stack on every AI stream chunk while typing.
  const [streamTick, setStreamTick] = useState(0);
  useEffect(() => {
    if (!permission) {
      setStreamTick(0);
      return;
    }
    setStreamTick(useChatStore.getState().streamTick);
    return useChatStore.subscribe((state, prev) => {
      if (state.streamTick !== prev.streamTick) {
        setStreamTick(state.streamTick);
      }
    });
  }, [permission?.id]);

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

  const smartCtx = useMemo(() => {
    if (!permission) return null;
    const input = {
      ...(permission.args ?? {}),
      ...(toolUse?.input && typeof toolUse.input === "object" ? toolUse.input : {}),
    };
    const base = buildToolSmartPermissionContext(
      { type: "tool_use", input, title: toolUse?.title },
      sessionRoot,
    );
    return {
      ...base,
      filePath: base.filePath || permission.message || null,
    };
  }, [permission, toolUse, sessionRoot]);

  const show = !!permission && !!smartCtx
    && resolveSmartPermissionAction({ toolName, ...smartCtx }, rules) === "prompt";
  const summary = useMemo(
    () => (permission && show ? permissionSummary(permission, toolUse, toolName) : null),
    [permission, show, toolUse, toolName, i18n.language],
  );

  const peekLabel = useMemo(() => {
    if (!show || !summary) return null;
    const detail = truncate(summary.detail, 72);
    if (isSimplePathPermissionGate(toolName)) {
      return detail ? `${summary.label} ${detail}` : summary.label;
    }
    return detail ? `${summary.label} · ${detail}` : summary.label;
  }, [show, summary, toolName, i18n.language]);

  // Stable reference — only changes when a field actually changes, so
  // consumers can safely use the gate object in useMemo dep arrays.
  return useMemo(
    () => ({ permission, toolName, show, summary, toolUse, peekLabel }),
    [permission, toolName, show, summary, toolUse, peekLabel],
  );
}

export function usePermissionGateOpen(): boolean {
  return usePermissionGateState().show;
}

export function usePermissionGatePeek(): string | null {
  return usePermissionGateState().peekLabel;
}


/**
 * One-line permission card in the composer chrome stack.
 * Whole card toggles expand; expanded shows path + short content peek only.
 */
export function PermissionGatePanel({ gate }: { gate?: PermissionGateState }) {
  if (gate) return <PermissionGatePanelInner gate={gate} />;
  return <PermissionGatePanelWithOwnState />;
}

function PermissionGatePanelWithOwnState() {
  const gate = usePermissionGateState();
  return <PermissionGatePanelInner gate={gate} />;
}

function PermissionGatePanelInner({ gate }: { gate: PermissionGateState }) {
  const { t } = useTranslation();
  const activeTabId = useChatStore((s) => s.activeTabId);
  const draftEmpty = useComposerEditorStore((s) => s.draftEmpty);
  const { permission, toolName, show, summary, toolUse } = gate;
  const [resolving, setResolving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isSimple = isSimplePathPermissionGate(toolName);

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

  useEffect(() => {
    if (!show || !isSimple || resolving) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        void deny();
        return;
      }
      if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(".cm-editor") && !draftEmpty) return;
      e.preventDefault();
      void allow(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [show, isSimple, resolving, draftEmpty, allow, deny]);

  if (!show || !permission || !summary || !peek) return null;

  const alwaysLabel = toolName
    ? isBashToolName(toolName) || toolName === "experiment-run"
      ? t("dialogs.permission.alwaysBash")
      : t("dialogs.permission.alwaysTool", { tool: toolName })
    : t("dialogs.permission.alwaysGeneric");

  const hasExpandBody = !isSimple && !!(peek.path || peek.preview);
  const confirmLabel = isSimple ? summary.label : t("dialogs.permission.allow");

  if (isSimple) {
    return (
      <ComposerChromeCard className="overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[length:var(--font-chat-meta)]">
          <span className="min-w-0 flex-1 truncate text-left">
            <span className="font-medium text-foreground">{summary.label}</span>
            {" "}
            <span className="text-muted-foreground">{summary.detail}</span>
          </span>
          <div className="flex shrink-0 items-center gap-1">
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
              {t("dialogs.permission.skip")}
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 font-medium",
                "bg-primary text-primary-foreground transition-opacity",
                "hover:opacity-90",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
              onClick={() => void allow(false)}
              disabled={resolving}
            >
              {confirmLabel}
              <CornerDownLeftIcon className="size-3 shrink-0 opacity-80" aria-hidden />
            </button>
          </div>
        </div>
      </ComposerChromeCard>
    );
  }

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
            {confirmLabel}
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
