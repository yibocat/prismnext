import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyIcon, CheckIcon, HistoryIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useChatStore } from "@/stores/chat-store";
import { formatRelativeTimeMs } from "@/lib/chat/relative-time";

interface TurnFooterProps {
  turnIndex: number;
  copyText: string;
  isComplete: boolean;
  completedAt?: number | null;
  modelLabel?: string | null;
  /** Duration / token summary — shown as hint on the time label. */
  detailHint?: string | null;
}

const ICON_BTN =
  "flex size-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground";

export const TurnFooter = memo(function TurnFooter({
  turnIndex,
  copyText,
  isComplete,
  completedAt,
  modelLabel,
  detailHint,
}: TurnFooterProps) {
  const { t } = useTranslation();
  const activeTabId = useChatStore((s) => s.activeTabId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const checkpoint = useCheckpointStore((s) =>
    s.byTab[activeTabId]?.checkpoints.find((c) => c.turnIndex === turnIndex),
  );
  const canRestore = useCheckpointStore((s) => s.canRestoreToTurn(activeTabId, turnIndex));

  const [copied, setCopied] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!completedAt || !isComplete) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [completedAt, isComplete]);

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
      toast.success(
        t("chat.turnFooter.restored", {
          count,
          defaultValue: `Restored ${count} file${count === 1 ? "" : "s"} to the end of this turn`,
        }),
        {
          description: t("chat.turnFooter.restoredDesc", {
            defaultValue: "Workspace files and chat history were rolled back to this turn.",
          }),
        },
      );
    } catch (err) {
      toast.error(
        t("chat.turnFooter.restoreFailed", {
          message: (err as Error).message,
          defaultValue: `Restore failed: ${(err as Error).message}`,
        }),
      );
    } finally {
      setRestoring(false);
    }
  }, [activeTabId, canRestore, isStreaming, restoring, t, turnIndex]);

  if (!isComplete) return null;

  const showCopy = copyText.trim().length > 0;
  const showRestore = canRestore && !isStreaming;
  const relative =
    completedAt != null && completedAt > 0
      ? formatRelativeTimeMs(completedAt, now)
      : null;

  if (!showCopy && !showRestore && !relative && !modelLabel) return null;

  return (
    <div className="flex items-center justify-end gap-1.5 pt-1 pb-1 mb-3">
      {relative ? (
        <Hint label={detailHint || relative}>
          <span className="px-1 text-[length:var(--font-chat-meta)] text-muted-foreground/55 tabular-nums">
            {relative}
          </span>
        </Hint>
      ) : null}
      {modelLabel ? (
        <span
          className="max-w-[9rem] truncate px-1 text-[length:var(--font-chat-meta)] text-muted-foreground/55"
          title={modelLabel}
        >
          {modelLabel}
        </span>
      ) : null}
      {showRestore ? (
        <Hint label={t("chat.turnFooter.restore", { defaultValue: "Restore workspace files to the end of this turn" })}>
          <button
            type="button"
            onClick={handleRestore}
            disabled={restoring}
            className={cn(ICON_BTN, "disabled:opacity-50")}
          >
            {restoring ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <HistoryIcon className="size-3" />
            )}
          </button>
        </Hint>
      ) : null}
      {showCopy ? (
        <Hint label={t("chat.turnFooter.copy", { defaultValue: "Copy this turn" })}>
          <button type="button" onClick={handleCopy} className={ICON_BTN}>
            {copied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
          </button>
        </Hint>
      ) : null}
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
