import { memo, useMemo, useState } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { ArrowRightIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  StatusIcon,
  TOOL_PANEL_CLASS,
  TOOL_INLINE_ROW_CLASS,
  TOOL_INLINE_LABEL_CLASS,
  TOOL_EXPANDED_CONTENT_CLASS,
  basenamePath,
  param,
} from "./shared";
import { ChatFileLink } from "../chat-file-link";
import { useToolPermission } from "./use-tool-permission";
import { isComposerHostedPermission } from "../permission-gate-panel";
import { useSettingsStore } from "@/stores/settings-store";

export const MoveWidget = memo(function MoveWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const { isAwaitingPermission, isToolDenied } = useToolPermission(
    toolUse.id || "",
    toolName,
  );
  const composerHosted = isComposerHostedPermission(
    permissionMode,
    toolName,
    isAwaitingPermission,
  );
  const srcPath =
    param(toolUse.input, "source_path", "sourcePath")
    || param(toolUse.input, "source", "src") || "";
  const dstPath =
    param(toolUse.input, "destination_path", "destinationPath")
    || param(toolUse.input, "destination", "dst") || "";
  const isError = toolResult?.is_error;
  const isLoading = !toolResult && !isAwaitingPermission && !isToolDenied;
  const isDone = !!toolResult && !isError && !isToolDenied;

  const resultText = useMemo(() => {
    if (!toolResult?.content) return "";
    return typeof toolResult.content === "string"
      ? toolResult.content
      : JSON.stringify(toolResult.content);
  }, [toolResult]);

  const resultDisplay = useMemo(() => {
    if (!resultText) return "";
    if (resultText.includes("Permission denied")) return "Permission denied";
    if (srcPath && dstPath && resultText.startsWith("Moved:")) {
      return `Moved: ${basenamePath(srcPath)} → ${basenamePath(dstPath)}`;
    }
    if (srcPath && resultText.includes("not found")) return `Not found: ${basenamePath(srcPath)}`;
    if (srcPath && resultText.startsWith("Failed")) {
      return `Failed: ${basenamePath(srcPath)} → ${basenamePath(dstPath)}`;
    }
    return resultText;
  }, [resultText, srcPath, dstPath]);

  if (composerHosted) {
    return (
      <button
        type="button"
        className={cn(
          TOOL_INLINE_ROW_CLASS,
          "w-full cursor-default text-left text-[length:var(--font-chat-message)] py-1",
        )}
      >
        <StatusIcon isLoading={false} isError={false} />
        <span className="shrink-0 text-muted-foreground/55">{toolName}</span>
        <ArrowRightIcon className="size-3.5 shrink-0 text-info" />
        <span className={cn(TOOL_INLINE_LABEL_CLASS, "flex items-center gap-1")}>
          {srcPath ? <ChatFileLink path={srcPath} /> : "…"}
          <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground/60" />
          {dstPath ? <ChatFileLink path={dstPath} /> : "…"}
        </span>
        <span className="text-primary shrink-0 text-[length:var(--font-chat-meta)]">
          Confirm above
        </span>
      </button>
    );
  }

  if (isDone || isToolDenied || (isError && !isAwaitingPermission)) {
    const summary = isToolDenied ? "Denied" : isError ? "Failed" : "Moved";
    const canExpand = !!resultDisplay;
    return (
      <div>
        <button
          type="button"
          className={cn(
            TOOL_INLINE_ROW_CLASS,
            "w-full text-left text-[length:var(--font-chat-message)] py-1",
            !canExpand && "cursor-default",
          )}
          onClick={() => canExpand && setExpanded(!expanded)}
        >
          <StatusIcon isLoading={false} isError={!!isError || isToolDenied} />
          <span className="shrink-0 text-muted-foreground/55">{toolName}</span>
          <ArrowRightIcon className="size-3.5 shrink-0 text-info" />
          <span className={cn(TOOL_INLINE_LABEL_CLASS, "flex items-center gap-1")}>
            {srcPath ? <ChatFileLink path={srcPath} /> : "…"}
            <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground/60" />
            {dstPath ? <ChatFileLink path={dstPath} /> : "…"}
          </span>
          <span className="text-muted-foreground/60 shrink-0 text-[length:var(--font-chat-meta)]">
            {summary}
          </span>
          {canExpand && (
            <ChevronDownIcon
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                expanded ? "rotate-0" : "-rotate-90",
              )}
            />
          )}
        </button>
        {expanded && resultDisplay && (
          <div
            className={cn(
              TOOL_EXPANDED_CONTENT_CLASS,
              "truncate text-[length:var(--font-chat-meta)] text-muted-foreground font-mono",
            )}
          >
            {resultDisplay}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        TOOL_PANEL_CLASS,
        "flex items-center gap-2 px-2.5 py-1.5 text-[length:var(--font-chat-message)]",
      )}
    >
      {isLoading ? (
        <StatusIcon isLoading isError={false} />
      ) : (
        <ArrowRightIcon className="size-3.5 shrink-0 text-info" />
      )}
      <p className="min-w-0 flex-1 truncate text-foreground/90 flex items-center gap-1">
        {srcPath ? <ChatFileLink path={srcPath} className="font-medium" title={srcPath} /> : "…"}
        <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
        {dstPath ? <ChatFileLink path={dstPath} className="font-medium" title={dstPath} /> : "…"}
        <span className="shrink-0">?</span>
      </p>
    </div>
  );
});
