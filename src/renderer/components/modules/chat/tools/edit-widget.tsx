import { useState, useEffect, useMemo, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
import { FileEditIcon, CheckIcon } from "lucide-react";
import { ToolCard, DiffLines, DiffStatBadge, computeLineDiffStats, param } from "./shared";
import { ChatFileLink } from "../chat-file-link";
import { ChangeReviewBar } from "./change-review-bar";
import { useToolPermission } from "./use-tool-permission";
import { useSettingsStore } from "@/stores/settings-store";
import { shouldTrackProposedChange } from "./tool-meta";
import { resolvePermissionMode } from "@shared/permission-modes";

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
  const [resolved, setResolved] = useState<"accepted" | "rejected" | null>(null);
  const [reviewResolving, setReviewResolving] = useState(false);
  const [snapshot, setSnapshot] = useState<{ oldContent: string; newContent: string; filePath: string } | null>(
    () => {
      const c = useChangesStore.getState().changes.find((ch) => ch.id === toolUse.id);
      return c ? { oldContent: c.oldContent, newContent: c.newContent, filePath: c.filePath } : null;
    },
  );
  const change = useChangesStore((s) => s.changes.find((c) => c.id === toolUse.id));
  const acceptChange = useChangesStore((s) => s.acceptChange);
  const rejectChange = useChangesStore((s) => s.rejectChange);
  const { isAwaitingPermission, isToolDenied } =
    useToolPermission(toolUse.id || "", toolName);
  const permissionMode = useSettingsStore((s) => s.settings.permissionMode);
  const showPermissionAsk =
    isAwaitingPermission && resolvePermissionMode(permissionMode) === "ask";
  const showChangeReview =
    !isAwaitingPermission &&
    !!change &&
    shouldTrackProposedChange(permissionMode, toolName);
  const isWrite = toolUse.name?.toLowerCase().startsWith("write");

  useEffect(() => {
    if (change && !snapshot) {
      setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
    }
  }, [change, snapshot]);

  const activeFilePath = change?.filePath || snapshot?.filePath
    || param(toolUse.input, "file_path", "filePath")
    || param(toolUse.input, "path") || "unknown";
  const activeOldText = change?.oldContent ?? snapshot?.oldContent
    ?? param(toolUse.input, "old_string", "oldString") ?? "";
  const activeNewText = change?.newContent ?? snapshot?.newContent
    ?? param(toolUse.input, "new_string", "newString")
    ?? param(toolUse.input, "content") ?? "";
  const fileName = activeFilePath.split("/").pop() || activeFilePath;
  const isError = toolResult?.is_error;
  const isDenied = isToolDenied;
  const isLoading = !toolResult && !showPermissionAsk && !isDenied;
  const lineStats = useMemo(
    () => computeLineDiffStats(activeOldText, activeNewText),
    [activeOldText, activeNewText],
  );
  const showLineStats =
    !isLoading
    && !isDenied
    && !showPermissionAsk
    && !isError
    && !resolved
    && (lineStats.added > 0 || lineStats.removed > 0);
  const hasData = !!(change || snapshot?.oldContent
    || toolUse.input?.old_string || toolUse.input?.oldString
    || toolUse.input?.new_string || toolUse.input?.newString);

  const handleAcceptReview = async () => {
    if (!change || reviewResolving) return;
    setReviewResolving(true);
    try {
      setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
      await acceptChange(change.id);
      setResolved("accepted");
    } finally {
      setReviewResolving(false);
    }
  };

  const handleRejectReview = async () => {
    if (!change || reviewResolving) return;
    setReviewResolving(true);
    try {
      setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
      await rejectChange(change.id);
      setResolved("rejected");
    } finally {
      setReviewResolving(false);
    }
  };

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
        resolved || isDenied || showPermissionAsk || isLoading || isError ? (
          <span className="text-muted-foreground/60 shrink-0 text-[length:var(--font-chat-meta)]">
            {resolved
              ? resolved === "accepted" ? "Accepted" : "Rejected"
              : isDenied
                ? "Denied"
                : showPermissionAsk
                  ? "Awaiting permission"
                  : isLoading
                    ? (isWrite ? "Writing…" : "Editing…")
                    : "Failed"}
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
      statusIcon={resolved ? <CheckIcon className="size-3.5 text-success" /> : undefined}
    >
      <pre className="max-w-full font-mono whitespace-pre-wrap break-all overflow-x-hidden overflow-y-auto max-h-80">
        {(change || snapshot) ? (
          <DiffLines oldStr={activeOldText} newStr={activeNewText} />
        ) : activeOldText || activeNewText ? (
          <DiffLines oldStr={activeOldText} newStr={activeNewText} />
        ) : param(toolUse.input, "content") ? (
          <div className="text-muted-foreground">{(param(toolUse.input, "content") || "").slice(0, 500)}</div>
        ) : null}
      </pre>

      {!resolved && showChangeReview && (!isLoading || !!change) && !isError && (
        <ChangeReviewBar
          label={isWrite ? "Review write" : "Review edit"}
          onAccept={handleAcceptReview}
          onReject={handleRejectReview}
          resolving={reviewResolving}
        />
      )}
    </ToolCard>
  );
});
