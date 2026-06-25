import { useState, useCallback } from "react";
import { ArrowLeftIcon, AlertTriangleIcon } from "lucide-react";
import {
  AppMenu,
  AppMenuContent,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDocumentStore } from "@/stores/document-store";
import { discardAndCloseWorktree } from "@/lib/git/git-orchestrator";
import { useResolvedWorktree } from "@/lib/git/use-resolved-worktree";
import { WorktreeMergePanel } from "./worktree-merge-panel";
import { cn } from "@/lib/utils";

export function WorktreeActions() {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeWorktree = useResolvedWorktree();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleMoveToLocal = useCallback(async () => {
    if (!projectRoot || !activeWorktree) return;

    if (activeWorktree.aheadCount > 0) {
      setShowDiscardConfirm(true);
      return;
    }

    await discardAndCloseWorktree(projectRoot, activeWorktree);
  }, [projectRoot, activeWorktree]);

  const handleConfirmDiscard = useCallback(async () => {
    if (!projectRoot || !activeWorktree) return;
    setShowDiscardConfirm(false);
    await discardAndCloseWorktree(projectRoot, activeWorktree);
  }, [projectRoot, activeWorktree]);

  if (!activeWorktree) return null;

  return (
    <div className="flex items-center gap-2">
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

      <AppMenu open={mergeOpen} onOpenChange={setMergeOpen}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
              "text-[length:var(--font-chat-meta)] transition-colors",
              mergeOpen
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15",
            )}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span>Merge to Branch</span>
            <span className="text-[length:var(--font-hint)] opacity-60">▾</span>
          </button>
        </AppMenuTrigger>
        <AppMenuContent align="end" className="w-80 !gap-0 !p-0 overflow-hidden">
          <WorktreeMergePanel onClose={() => setMergeOpen(false)} />
        </AppMenuContent>
      </AppMenu>

      <Dialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangleIcon className="size-4 text-amber-500" />
              Discard unmerged work?
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              This worktree has{" "}
              <strong className="text-foreground">
                {activeWorktree.aheadCount} unmerged commit{activeWorktree.aheadCount !== 1 ? "s" : ""}
              </strong>{" "}
              that will be <strong className="text-destructive">permanently deleted</strong>.
            </p>
            <p>
              Merge to Branch first to integrate changes into{" "}
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
