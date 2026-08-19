import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyIcon, CheckIcon, Undo2Icon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import { countConversationTurns } from "@/lib/chat/conversation-view";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useChatStore } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
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
  "flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground";

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
  const committedTurnCount = useChatStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);
    return countConversationTurns(tab?.conversation);
  });
  const checkpointTick = useCheckpointStore((s) => {
    const tab = s.byTab[activeTabId];
    return `${tab?.boundCheckoutPath ?? ""}:${tab?.checkpoints.length ?? 0}`;
  });
  const canRollback = useMemo(
    () => useCheckpointStore.getState().canRollbackToTurn(activeTabId, turnIndex),
    [activeTabId, checkpointTick, committedTurnCount, turnIndex],
  );

  const [copied, setCopied] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
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

  const handleRollback = useCallback(async () => {
    if (!canRollback || rollingBack || isStreaming) return;

    const chatTab = useChatStore.getState().tabs.find((t) => t.id === activeTabId);
    const turnCount = countConversationTurns(chatTab?.conversation);
    const hasLaterTurns = turnIndex < turnCount - 1;
    const tabCp = useCheckpointStore.getState().byTab[activeTabId];
    const fileTarget =
      tabCp?.checkpoints.find((c) => c.turnIndex === turnIndex)
      ?? [...(tabCp?.checkpoints ?? [])].reverse().find((c) => c.turnIndex <= turnIndex)
      ?? null;
    const hasFiles = Boolean(fileTarget?.files.length);
    const hasProposed = useChangesStore.getState().changes.length > 0;

    // Tip with nothing to rewind — keep the icon, explain instead of a fake regret.
    if (!hasLaterTurns && !hasFiles && !hasProposed) {
      toast.message(
        t("chat.turnFooter.alreadyAtTurn", {
          defaultValue: "Already at the end of this turn — nothing later to roll back",
        }),
      );
      return;
    }

    setRollingBack(true);
    try {
      const count = await useCheckpointStore.getState().rollbackToTurn(activeTabId, turnIndex);
      toast.success(
        t("chat.turnFooter.rolledBack", {
          count,
          defaultValue: count > 0
            ? `Rolled back ${count} file${count === 1 ? "" : "s"} to the end of this turn`
            : "Rolled back chat to the end of this turn",
        }),
        {
          description: t("chat.turnFooter.rolledBackDesc", {
            defaultValue: "Chat, workspace files, and proposed changes were rolled back to this turn.",
          }),
        },
      );
    } catch (err) {
      toast.error(
        t("chat.turnFooter.rollbackFailed", {
          message: (err as Error).message,
          defaultValue: `Rollback failed: ${(err as Error).message}`,
        }),
      );
    } finally {
      setRollingBack(false);
    }
  }, [activeTabId, canRollback, isStreaming, rollingBack, t, turnIndex]);

  if (!isComplete) return null;

  const showCopy = copyText.trim().length > 0;
  const showRollback = canRollback && !isStreaming;
  const relative =
    completedAt != null && completedAt > 0
      ? formatRelativeTimeMs(completedAt, now)
      : null;

  if (!showCopy && !showRollback && !relative && !modelLabel) return null;

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
      {showRollback ? (
        <Hint label={t("chat.turnFooter.rollback", { defaultValue: "Roll back chat and files to the end of this turn" })}>
          <button
            type="button"
            onClick={handleRollback}
            disabled={rollingBack}
            className={cn(ICON_BTN, "disabled:opacity-50")}
          >
            {rollingBack ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <Undo2Icon className="size-3" />
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
export function extractTurnCopyTextFromBlocks(
  blocks: Array<{ type?: string; text?: string }>,
): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text" && block.text) parts.push(block.text);
  }
  return parts.join("\n\n");
}

/** @deprecated Prefer extractTurnCopyTextFromBlocks — ChatStream response list. */
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
