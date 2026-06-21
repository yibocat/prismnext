import { memo, useCallback, useState } from "react";
import { CopyIcon, CheckIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useChatStore } from "@/stores/chat-store";

interface TurnFooterProps {
  turnIndex: number;
  copyText: string;
  metaText?: string;
  isComplete: boolean;
}

export const TurnFooter = memo(function TurnFooter({
  turnIndex,
  copyText,
  metaText,
  isComplete,
}: TurnFooterProps) {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const checkpoint = useCheckpointStore((s) => s.byTab[activeTabId]?.checkpoints.find((c) => c.turnIndex === turnIndex));
  const canRestore = useCheckpointStore((s) => s.canRestoreToTurn(activeTabId, turnIndex));

  const [copied, setCopied] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!copyText.trim()) return;
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [copyText]);

  const handleRestore = useCallback(async () => {
    if (!canRestore || restoring || isStreaming) return;
    setRestoring(true);
    try {
      const count = await useCheckpointStore.getState().restoreToTurn(activeTabId, turnIndex);
      toast.success(`Restored ${count} file${count === 1 ? "" : "s"} to the end of this turn`, {
        description: "Workspace files and chat history were rolled back to this turn.",
      });
    } catch (err) {
      toast.error(`Restore failed: ${(err as Error).message}`);
    } finally {
      setRestoring(false);
    }
  }, [activeTabId, canRestore, isStreaming, restoring, turnIndex]);

  if (!isComplete) return null;

  const touchedCount = checkpoint?.touchedThisTurn.length ?? 0;
  const showActions = copyText.trim().length > 0 || canRestore;

  if (!showActions && !metaText) return null;

  return (
    <div className="group/footer flex items-center gap-2 px-6 py-1.5 mt-0.5">
      {copyText.trim().length > 0 && (
        <button
          type="button"
          onClick={handleCopy}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-all hover:bg-accent hover:text-accent-foreground group-hover/footer:opacity-100"
          title="Copy this turn"
        >
          {copied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
        </button>
      )}
      {canRestore && !isStreaming && (
        <button
          type="button"
          onClick={handleRestore}
          disabled={restoring}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[length:var(--font-chat-meta)]",
            "text-muted-foreground/70 opacity-0 transition-all hover:bg-accent hover:text-accent-foreground",
            "group-hover/footer:opacity-100 disabled:opacity-50",
          )}
          title="Restore workspace files to the end of this turn"
        >
          {restoring ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <HistoryIcon className="size-3" />
          )}
          <span>Restore here</span>
          {touchedCount > 0 && (
            <span className="text-muted-foreground/50 tabular-nums">({touchedCount} file{touchedCount === 1 ? "" : "s"})</span>
          )}
        </button>
      )}
      {metaText && (
        <span className="ml-auto text-[length:var(--font-chat-meta)] text-muted-foreground/50 tabular-nums">
          {metaText}
        </span>
      )}
    </div>
  );
});

/** Collect assistant text blocks from a turn for copy-to-clipboard. */
export function extractTurnCopyText(
  responses: { msg: { type?: string; message?: { content?: unknown } } }[],
): string {
  const parts: string[] = [];
  for (const { msg } of responses) {
    if (msg.type !== "assistant") continue;
    const content = msg.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
        const text = (block as { text?: string }).text;
        if (text) parts.push(text);
      }
    }
  }
  return parts.join("\n\n");
}
