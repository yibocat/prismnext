import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
import {
  CHAT_PANEL_TOOLBAR_BUTTON,
  CHAT_PANEL_TOOLBAR_BUTTON_PRIMARY,
} from "./worktree-selector";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

export function WorktreeActions() {
  const { t } = useTranslation();
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
    <div className="flex items-center gap-1.5">
      <Hint label="Discard worktree and return to main project">
        <button
          type="button"
          onClick={handleMoveToLocal}
          className={CHAT_PANEL_TOOLBAR_BUTTON}
        >
          <ArrowLeftIcon className="size-3" />
          <span>Close Worktree</span>
        </button>
      </Hint>

      <AppMenu open={mergeOpen} onOpenChange={setMergeOpen}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              CHAT_PANEL_TOOLBAR_BUTTON_PRIMARY,
              mergeOpen && "bg-primary/10",
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
              {t("dialogs.worktree.discardTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              {t("dialogs.worktree.discardBody", { count: activeWorktree.aheadCount })}
            </p>
            <p>
              {t("dialogs.worktree.discardHint", { branch: activeWorktree.baseBranch })}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowDiscardConfirm(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDiscard}>
              {t("dialogs.worktree.discardConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
