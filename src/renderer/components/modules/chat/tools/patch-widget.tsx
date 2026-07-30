import { useState, useMemo, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { FileDiffIcon } from "lucide-react";
import { ToolCard, DiffLines, DiffStatBadge, computePatchLineStats, param } from "./shared";
import { ChatFileLink } from "../chat-file-link";
import { extractPatchTargetPaths } from "./tool-meta";
import { useToolPermission } from "./use-tool-permission";
import { useComposerHostedPermission } from "../permission-gate-panel";

export const PatchWidget = memo(function PatchWidget({
  toolUse,
  toolResult,
  toolName,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
  toolName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isError = toolResult?.is_error;
  const hasContent = toolResult?.content != null;
  const { isAwaitingPermission, isToolDenied } = useToolPermission(
    toolUse.id || "",
    toolName,
  );
  const showPermissionAsk = useComposerHostedPermission(toolUse, toolName, isAwaitingPermission);
  const isDenied = isToolDenied;
  const isLoading = !toolResult && !showPermissionAsk && !isDenied;

  const patchContent = param(toolUse.input, "patch") || param(toolUse.input, "content") || "";
  const filePath = param(toolUse.input, "file_path", "filePath") || param(toolUse.input, "path") || "";
  const patchPaths = useMemo(
    () => extractPatchTargetPaths(toolUse.input as Record<string, unknown>),
    [toolUse.input],
  );
  const primaryPath = filePath || patchPaths[0] || "";

  const fileCount = patchContent
    ? (patchContent.match(/^diff --git|^--- |^\+\+\+ /gm) || []).length / 3 || 1
    : 0;

  const fileName = primaryPath.split("/").pop() || (fileCount > 1 ? `${Math.ceil(fileCount)} files` : "patch");
  const showBody = !!patchContent || hasContent || showPermissionAsk;
  const patchStats = useMemo(
    () => (patchContent ? computePatchLineStats(patchContent) : { added: 0, removed: 0 }),
    [patchContent],
  );
  const showPatchStats =
    !!patchContent
    && !isLoading
    && !isDenied
    && !showPermissionAsk
    && !isError
    && (patchStats.added > 0 || patchStats.removed > 0);

  return (
    <ToolCard
      toolName={toolName}
      icon={<FileDiffIcon className="size-3.5 text-info" />}
      label={primaryPath ? (
        <ChatFileLink path={primaryPath} />
      ) : (
        <span className="truncate font-medium">{fileName}</span>
      )}
      meta={
        fileCount > 1 ? (
          <span className="text-muted-foreground/70 shrink-0 text-[length:var(--font-chat-meta)]">
            {Math.ceil(fileCount)} files
          </span>
        ) : isDenied || showPermissionAsk || isLoading || isError ? (
          <span className="text-muted-foreground/60 shrink-0 text-[length:var(--font-chat-meta)]">
            {showPermissionAsk
              ? "Awaiting permission"
              : isDenied
                ? "Denied"
                : isLoading
                  ? "Applying…"
                  : "Failed"}
          </span>
        ) : undefined
      }
      headerEnd={
        showPatchStats ? (
          <DiffStatBadge added={patchStats.added} removed={patchStats.removed} />
        ) : undefined
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
      isLoading={isLoading}
      isError={!!isError || isDenied}
      hasContent={showBody}
      bodyClassName="font-mono max-h-80 overflow-y-auto whitespace-pre-wrap break-all"
    >
      {patchContent ? (
        <DiffLines oldStr="" newStr={patchContent} />
      ) : hasContent ? (
        <span className="text-muted-foreground">
          {typeof toolResult?.content === "string"
            ? toolResult.content.slice(0, 3000)
            : JSON.stringify(toolResult?.content ?? "", null, 2).slice(0, 3000)}
        </span>
      ) : null}
    </ToolCard>
  );
});
