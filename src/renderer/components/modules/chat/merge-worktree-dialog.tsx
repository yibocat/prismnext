import { useState, useCallback } from "react";
import { Loader2Icon, GitMergeIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

export function MergeWorktreeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const { activeWorktree, refreshWorktrees } = useWorktreeStore();
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleMerge = useCallback(async () => {
    if (!activeWorktree || !projectRoot) return;
    setMerging(true);

    try {
      // Switch to the worktree's base branch on the project repo
      const targetBranch = activeWorktree.baseBranch || "main";
      await window.electronAPI.gitCheckout(projectRoot, targetBranch);
      // Merge the worktree branch
      const mergeResult = await window.electronAPI.gitMerge(projectRoot, activeWorktree.branch);
      if (mergeResult.success) {
        try { await window.electronAPI.gitDeleteBranch(projectRoot, activeWorktree.branch); } catch {}
        // Remove the worktree directory
        try { await window.electronAPI.worktreeRemove(projectRoot, activeWorktree.name); } catch {}
        setResult({ success: true });
      } else {
        // Merge conflict or other failure — open the Git panel so the user
        // can see conflicted files and resolve them.
        useRightPanelStore.getState().ensureTab("git-overview");
        const detail = mergeResult.error || mergeResult.output || "Merge failed";
        setResult({
          success: false,
          error: `Merge conflict detected. Open the Git panel to resolve conflicts, then commit the result. Or use 'Abort merge' in the branch menu to cancel.\n\n${detail}`,
        });
      }
    } catch (err: unknown) {
      setResult({ success: false, error: (err as Error).message });
    }

    setMerging(false);
    await refreshWorktrees(projectRoot);
  }, [activeWorktree, projectRoot, refreshWorktrees]);

  if (!activeWorktree) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMergeIcon className="size-4" />
            Merge Worktree: {activeWorktree.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-80 overflow-y-auto">
          <div className="text-sm text-muted-foreground text-center py-4">
            Merge branch "{activeWorktree.branch}" into main. The worktree will be removed after a successful merge.
          </div>

          {result && (
            <div className={`text-sm p-2 rounded ${result.success ? "text-green-600 bg-green-50 dark:bg-green-950" : "text-destructive bg-destructive/10"}`}>
              {result.success
                ? "Merged successfully! Worktree removed."
                : `Merge failed: ${result.error}`}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={merging}>
            {result?.success ? "Close" : "Cancel"}
          </Button>
          {!result?.success && (
            <Button onClick={handleMerge} disabled={merging}>
              {merging ? <Loader2Icon className="size-4 animate-spin mr-1" /> : null}
              Merge into main
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
