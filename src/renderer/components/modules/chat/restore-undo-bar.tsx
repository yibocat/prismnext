import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcwIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useChatStore } from "@/stores/chat-store";
import { Hint } from "@/components/ui/hint";

/** Banner after a world rollback — 「后悔」undoes the last rollback. */
export const RestoreUndoBar = memo(function RestoreUndoBar() {
  const { t } = useTranslation();
  const activeTabId = useChatStore((s) => s.activeTabId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const canUndo = useCheckpointStore((s) => s.canUndoRollback(activeTabId));

  const [undoing, setUndoing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const prevCanUndo = useRef(false);

  useEffect(() => {
    setDismissed(false);
  }, [activeTabId]);

  useEffect(() => {
    if (canUndo && !prevCanUndo.current) {
      setDismissed(false);
    }
    prevCanUndo.current = canUndo;
  }, [canUndo]);

  const handleUndo = useCallback(async () => {
    if (!canUndo || undoing || isStreaming) return;
    setUndoing(true);
    try {
      const result = await useCheckpointStore.getState().undoLastRollback(activeTabId);
      if (!result.ok) {
        throw new Error("Nothing to undo");
      }
      setDismissed(true);
      if (result.sessionRestored) {
        toast.success(
          t("chat.regretBar.undone", {
            defaultValue: "Rollback undone — chat and files are back",
          }),
        );
      } else {
        toast.success(
          t("chat.regretBar.undonePartial", {
            defaultValue: "Rollback undone in the UI — session history may be incomplete (restart cleared the backup)",
          }),
        );
      }
    } catch (err) {
      toast.error(
        t("chat.regretBar.undoFailed", {
          message: (err as Error).message,
          defaultValue: `Undo failed: ${(err as Error).message}`,
        }),
      );
    } finally {
      setUndoing(false);
    }
  }, [activeTabId, canUndo, isStreaming, t, undoing]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!canUndo || dismissed || isStreaming) return null;

  return (
    <div data-chat-width className="w-full px-3 pb-2">
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[length:var(--font-chat-meta)]">
        <RotateCcwIcon className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <span className="flex-1 text-foreground/80">
          {t("chat.regretBar.message", {
            defaultValue: "Rolled back to an earlier turn.",
          })}
        </span>
        <button
          type="button"
          onClick={handleUndo}
          disabled={undoing}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-500/20 dark:text-amber-300 transition-colors disabled:opacity-50"
        >
          {undoing ? <Loader2Icon className="size-3 animate-spin" /> : null}
          {t("chat.regretBar.undo", { defaultValue: "Undo rollback" })}
        </button>
        <Hint label={t("chat.regretBar.dismiss", { defaultValue: "Dismiss" })}>
          <button
            type="button"
            onClick={handleDismiss}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <XIcon className="size-3" />
          </button>
        </Hint>
      </div>
    </div>
  );
});
