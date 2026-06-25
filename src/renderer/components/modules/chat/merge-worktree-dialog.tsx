import { useState, useCallback } from "react";
import { Loader2Icon, GitMergeIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useDocumentStore } from "@/stores/document-store";
import {
  buildMergeCloseStepLabels,
  mergeAndCloseWorktree,
} from "@/lib/git/git-orchestrator";
import { useResolvedWorktree } from "@/lib/git/use-resolved-worktree";

export function MergeWorktreeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const activeWorktree = useResolvedWorktree();
  const [merging, setMerging] = useState(false);
  const [mergeStep, setMergeStep] = useState(-1);
  const [mergeSteps, setMergeSteps] = useState<string[]>([]);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleMerge = useCallback(async () => {
    if (!activeWorktree || !projectRoot) return;
    setMerging(true);
    setResult(null);
    setMergeStep(0);

    const targetBranch = activeWorktree.baseBranch || "main";
    const currentBranch = await window.electronAPI.gitStatus(projectRoot)
      .then((s) => s.branch)
      .catch(() => "");
    const labels = buildMergeCloseStepLabels(targetBranch, currentBranch === targetBranch);
    setMergeSteps(labels);

    const mergeResult = await mergeAndCloseWorktree(
      projectRoot,
      activeWorktree,
      (progress) => setMergeStep(progress.index),
    );

    if (mergeResult.success) {
      setResult({ success: true });
    } else {
      setResult({
        success: false,
        error: mergeResult.error,
      });
    }

    setMerging(false);
  }, [activeWorktree, projectRoot]);

  if (!activeWorktree) return null;

  const targetBranch = activeWorktree.baseBranch || "main";

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
            Merge branch &quot;{activeWorktree.branch}&quot; into {targetBranch}. The worktree will be removed after a successful merge.
          </div>

          {merging && mergeSteps.length > 0 && (
            <div className="space-y-1.5 px-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin shrink-0" />
                <span className="truncate">{mergeSteps[mergeStep] || mergeSteps[mergeSteps.length - 1]}</span>
              </div>
              <Progress value={((mergeStep + 1) / mergeSteps.length) * 100} />
            </div>
          )}

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
              Merge into {targetBranch}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
