import { useState, useEffect, memo } from "react";
import type { ContentBlock } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
import { FileEditIcon, CheckIcon, XIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusIcon, DiffLines } from "./shared";

export const EditWidget = memo(function EditWidget({
  toolUse,
  toolResult,
}: {
  toolUse: ContentBlock;
  toolResult?: ContentBlock;
}) {
  const [expanded, setExpanded] = useState(true);
  const [resolved, setResolved] = useState<"accepted" | "rejected" | null>(null);
  const [snapshot, setSnapshot] = useState<{ oldContent: string; newContent: string; filePath: string } | null>(
    () => {
      const c = useChangesStore.getState().changes.find((ch) => ch.id === toolUse.id);
      return c ? { oldContent: c.oldContent, newContent: c.newContent, filePath: c.filePath } : null;
    },
  );
  const change = useChangesStore((s) => s.changes.find((c) => c.id === toolUse.id));
  const acceptChange = useChangesStore((s) => s.acceptChange);
  const rejectChange = useChangesStore((s) => s.rejectChange);
  const isWrite = toolUse.name?.toLowerCase().startsWith("write");

  useEffect(() => {
    if (change && !snapshot) {
      setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
    }
  }, [change, snapshot]);

  const activeFilePath = change?.filePath || snapshot?.filePath || toolUse.input?.file_path || toolUse.input?.path || "unknown";
  const activeOldText = change?.oldContent ?? snapshot?.oldContent ?? toolUse.input?.old_string ?? "";
  const activeNewText = change?.newContent ?? snapshot?.newContent ?? toolUse.input?.new_string ?? toolUse.input?.content ?? "";
  const fileName = activeFilePath.split("/").pop() || activeFilePath;
  const isError = toolResult?.is_error;
  const isLoading = !toolResult;
  const hasData = !!(change || snapshot?.oldContent || toolUse.input?.old_string || toolUse.input?.new_string);

  const handleAccept = async () => {
    if (!change) return;
    setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
    await acceptChange(change.id);
    setResolved("accepted");
  };

  const handleReject = async () => {
    if (!change) return;
    setSnapshot({ oldContent: change.oldContent, newContent: change.newContent, filePath: change.filePath });
    await rejectChange(change.id);
    setResolved("rejected");
  };

  return (
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors text-[length:var(--font-code)]"
        onClick={() => setExpanded(!expanded)}
      >
        {resolved ? (
          <CheckIcon className="size-3.5 text-success" />
        ) : (
          <StatusIcon isLoading={isLoading} isError={!!isError} />
        )}
        <FileEditIcon className="size-3.5 text-info" />
        <span className="truncate font-medium">{fileName}</span>
        {resolved ? (
          <span className="text-muted-foreground/60 shrink-0">{resolved === "accepted" ? "Accepted" : "Rejected"}</span>
        ) : (
          <span className="text-muted-foreground/60 shrink-0">
            {isLoading ? (isWrite ? "Writing..." : "Editing...") : isError ? "Failed" : (isWrite ? "Written" : "Edited")}
          </span>
        )}
        {!resolved && change && (
          <span className={cn(
            "text-[length:var(--font-badge)] font-mono shrink-0",
            activeNewText.length - activeOldText.length >= 0 ? "text-success" : "text-destructive",
          )}>
            {activeNewText.length - activeOldText.length >= 0 ? "+" : ""}{activeNewText.length - activeOldText.length}
          </span>
        )}
        <ChevronDownIcon
          className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && hasData && (
        <div className="border-t border-border">
          <pre className="px-3 py-2 font-mono text-[length:var(--font-code)] whitespace-pre-wrap break-all overflow-x-auto max-h-80 overflow-y-auto">
            {(change || snapshot) ? (
              <DiffLines oldStr={activeOldText} newStr={activeNewText} />
            ) : (
              <>
                {toolUse.input?.old_string && (
                  <div className="text-destructive/80 line-through mb-1">{toolUse.input.old_string.slice(0, 500)}</div>
                )}
                {toolUse.input?.new_string && (
                  <div className="text-success/80">{toolUse.input.new_string.slice(0, 500)}</div>
                )}
                {toolUse.input?.content && (
                  <div className="text-muted-foreground">{toolUse.input.content.slice(0, 500)}</div>
                )}
              </>
            )}
          </pre>

          {!resolved && change && !isLoading && !isError && (
            <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/30">
              <span className="text-[length:var(--font-chat-meta)] text-muted-foreground">
                {isWrite ? "Write" : "Edit"}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[length:var(--font-badge)] font-medium text-success hover:bg-success/10 dark:hover:bg-success/20 transition-colors"
                onClick={handleAccept}
              >
                <CheckIcon className="size-3" />
                Accept
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[length:var(--font-badge)] font-medium text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/10 transition-colors"
                onClick={handleReject}
              >
                <XIcon className="size-3" />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
