import { memo, useMemo, useState } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { Trash2Icon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

export const DeleteWidget = memo(function DeleteWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { isAwaitingPermission, isToolDenied, allow, deny, resolving } = useToolPermission(
    toolUse.id || "",
    toolName,
  );
  const filePath =
    param(toolUse.input, "file_path", "filePath")
    || param(toolUse.input, "path") || "";
  const fileName = filePath.split("/").pop() || filePath || "file";
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
    if (filePath && resultText.startsWith("Deleted:")) return `Deleted: ${basenamePath(filePath)}`;
    if (filePath && resultText.includes("not found")) return `Not found: ${basenamePath(filePath)}`;
    if (filePath && resultText.startsWith("Failed")) return `Failed: ${basenamePath(filePath)}`;
    return resultText;
  }, [resultText, filePath]);

  if (isDone || isToolDenied || (isError && !isAwaitingPermission)) {
    const summary = isToolDenied ? "Denied" : isError ? "Failed" : "Deleted";
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
          <Trash2Icon className="size-3.5 shrink-0 text-destructive" />
          <span className={TOOL_INLINE_LABEL_CLASS}>
            {filePath ? <ChatFileLink path={filePath} /> : fileName}
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
        <Trash2Icon className="size-3.5 shrink-0 text-destructive" />
      )}
      <p className="min-w-0 flex-1 truncate text-foreground/90">
        {filePath ? (
          <>
            Delete{" "}
            <ChatFileLink path={filePath} className="font-medium" title={filePath} />
            ?
          </>
        ) : (
          "Delete this file?"
        )}
      </p>
      {isAwaitingPermission && (
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Button type="button" variant="ghost" size="xs" disabled={resolving} onClick={() => void deny()}>
            Reject
          </Button>
          <Button type="button" size="xs" disabled={resolving} onClick={() => void allow()}>
            {resolving ? "…" : "Accept"}
          </Button>
        </div>
      )}
    </div>
  );
});
