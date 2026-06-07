import { useState, useCallback } from "react";
import { ArrowLeftIcon, AlertTriangleIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { WorktreePushPanel } from "./worktree-push-panel";
import { cn } from "@/lib/utils";

export function WorktreeActions() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const switchCheckoutRoot = useDocumentStore((s) => s.switchCheckoutRoot);
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);
  const moveToLocal = useWorktreeStore((s) => s.moveToLocal);
  const [pushOpen, setPushOpen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleMoveToLocal = useCallback(async () => {
    if (!projectRoot || !activeWorktree) return;

    // Safety check: if the worktree has unpushed commits, warn before
    // permanently deleting them (git branch -D is irreversible).
    if (activeWorktree.aheadCount > 0) {
      setShowDiscardConfirm(true);
      return;
    }

    await moveToLocal(projectRoot);
    switchCheckoutRoot(projectRoot);
  }, [projectRoot, activeWorktree, moveToLocal, switchCheckoutRoot]);

  const handleConfirmDiscard = useCallback(async () => {
    if (!projectRoot) return;
    setShowDiscardConfirm(false);
    await moveToLocal(projectRoot);
    switchCheckoutRoot(projectRoot);
  }, [projectRoot, moveToLocal, switchCheckoutRoot]);

  // Only render when a worktree is active
  if (!activeWorktree) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Close Worktree — discard isolation and return to main project */}
      <button
        type="button"
        onClick={handleMoveToLocal}
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1",
          "text-[length:var(--font-chat-meta)] transition-colors",
          "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
        title="Discard worktree and return to main project"
      >
        <ArrowLeftIcon className="size-3" />
        <span>Close Worktree</span>
      </button>

      {/* Push */}
      <DropdownMenu open={pushOpen} onOpenChange={setPushOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
              "text-[length:var(--font-chat-meta)] transition-colors",
              pushOpen
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15",
            )}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span>Push</span>
            <span className="text-[length:var(--font-hint)] opacity-60">▾</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 p-0">
          <WorktreePushPanel onClose={() => setPushOpen(false)} />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Discard confirmation dialog — shown when worktree has unpushed commits */}
      <Dialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangleIcon className="size-4 text-amber-500" />
              Discard unpushed work?
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              This worktree has{" "}
              <strong className="text-foreground">
                {activeWorktree.aheadCount} unpushed commit{activeWorktree.aheadCount !== 1 ? "s" : ""}
              </strong>{" "}
              that will be <strong className="text-destructive">permanently deleted</strong>.
            </p>
            <p>
              Push your changes first to save them to{" "}
              <code className="text-xs bg-muted px-1 rounded">{activeWorktree.baseBranch}</code>,
              or discard them if you no longer need this work.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowDiscardConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDiscard}>
              Discard &amp; Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
