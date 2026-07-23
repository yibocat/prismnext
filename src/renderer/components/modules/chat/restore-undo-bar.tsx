import { memo, useCallback, useEffect, useRef, useState } from "react";
import { RotateCcwIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useChatStore } from "@/stores/chat-store";
import { Hint } from "@/components/ui/hint";

export const RestoreUndoBar = memo(function RestoreUndoBar() {
  const activeTabId = useChatStore((s) => s.activeTabId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const canUndo = useCheckpointStore((s) => s.canUndoRestore(activeTabId));

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
      const ok = await useCheckpointStore.getState().undoLastRestore(activeTabId);
      if (!ok) {
        throw new Error("Nothing to undo");
      }
      setDismissed(true);
      toast.success("Restore undone — workspace files and chat history reverted");
    } catch (err) {
      toast.error(`Undo failed: ${(err as Error).message}`);
    } finally {
      setUndoing(false);
    }
  }, [activeTabId, canUndo, isStreaming, undoing]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (!canUndo || dismissed || isStreaming) return null;

  return (
    <div data-chat-width className="w-full px-3 pb-2">
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[length:var(--font-chat-meta)]">
        <RotateCcwIcon className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <span className="flex-1 text-foreground/80">
          Files and chat were restored to an earlier turn.
        </span>
        <button
          type="button"
          onClick={handleUndo}
          disabled={undoing}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-500/20 dark:text-amber-300 transition-colors disabled:opacity-50"
        >
          {undoing ? <Loader2Icon className="size-3 animate-spin" /> : null}
          Undo restore
        </button>
        <Hint label="Dismiss">
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
