import { useState, useMemo, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FileEditIcon } from "lucide-react";
import { ToolCard, DiffLines, DiffStatBadge, computeLineDiffStats, param } from "./shared";
import { ChatFileLink } from "../chat-file-link";
import { useToolPermission } from "./use-tool-permission";
import { useComposerHostedPermission } from "../permission-gate-panel";

export const EditWidget = memo(function EditWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { isAwaitingPermission, isToolDenied } =
    useToolPermission(toolUse.id || "", toolName);
  const showPermissionGate = useComposerHostedPermission(toolUse, toolName, isAwaitingPermission);
  const isWrite = toolUse.name?.toLowerCase().startsWith("write");

  const activeFilePath =
    param(toolUse.input, "file_path", "filePath")
    || param(toolUse.input, "path") || "unknown";
  const activeOldText = param(toolUse.input, "old_string", "oldString") ?? "";
  const activeNewText =
    param(toolUse.input, "new_string", "newString")
    ?? param(toolUse.input, "content") ?? "";
  const fileName = activeFilePath.split("/").pop() || activeFilePath;
  const isError = toolResult?.is_error;
  const isDenied = isToolDenied;
  const isLoading = !toolResult && !showPermissionGate && !isDenied;
  const lineStats = useMemo(
    () => computeLineDiffStats(activeOldText, activeNewText),
    [activeOldText, activeNewText],
  );
  const showLineStats =
    !isLoading
    && !isDenied
    && !showPermissionGate
    && !isError
    && (lineStats.added > 0 || lineStats.removed > 0);
  const hasData = !!(activeOldText || activeNewText || param(toolUse.input, "content"));

  return (
    <ToolCard
      toolName={toolName}
      icon={<FileEditIcon className="size-3.5 text-info" />}
      label={activeFilePath !== "unknown" ? (
        <ChatFileLink path={activeFilePath} />
      ) : (
        <span className="truncate font-medium">{fileName}</span>
      )}
      meta={
        isDenied || showPermissionGate || isLoading || isError ? (
          <span className="text-muted-foreground/60 shrink-0 text-[length:var(--font-chat-meta)]">
            {isDenied
              ? "Denied"
              : showPermissionGate
                ? "Confirm above"
                : isLoading
                  ? (isWrite ? "Writing…" : "Editing…")
                  : "Failed"}
          </span>
        ) : toolResult && !isError ? (
          <span className="text-muted-foreground/60 shrink-0 text-[length:var(--font-chat-meta)]">
            Applied
          </span>
        ) : undefined
      }
      headerEnd={
        showLineStats ? (
          <DiffStatBadge added={lineStats.added} removed={lineStats.removed} />
        ) : undefined
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError || isDenied}
      hasContent={hasData || isAwaitingPermission}
    >
      <pre className="max-w-full font-mono whitespace-pre-wrap break-all overflow-x-hidden overflow-y-auto max-h-80">
        {activeOldText || activeNewText ? (
          <DiffLines oldStr={activeOldText} newStr={activeNewText} />
        ) : param(toolUse.input, "content") ? (
          <div className="text-muted-foreground">{(param(toolUse.input, "content") || "").slice(0, 500)}</div>
        ) : null}
      </pre>
    </ToolCard>
  );
});
