import { useState, useEffect, useCallback } from "react";
import { Loader2Icon, AlertTriangleIcon, GitBranchIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { cn } from "@/lib/utils";

interface ChangedFile {
  path: string;
  status: string;
}

interface GitPushDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
}

export function GitPushDialog({ open, onOpenChange, projectRoot }: GitPushDialogProps) {
  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);

  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [pushing, setPushing] = useState(false);
  const [pushStep, setPushStep] = useState(-1);
  const [pushSteps, setPushSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const worktreeRoot = activeWorktree?.path;
  const baseBranch = activeWorktree?.baseBranch || "main";

  const loadFiles = useCallback(async () => {
    if (!worktreeRoot) return;
    try {
      await useDocumentStore.getState().saveAllFiles();
      const result = await window.electronAPI.gitStatus(worktreeRoot);
      if (result.files) {
        setFiles(
          result.files
            .filter((f: any) => f.staged || f.unstaged || f.untracked)
            .map((f: any) => ({
              path: f.path,
              status: f.untracked ? "?" : f.staged ? f.indexStatus : f.worktreeStatus,
            })),
        );
      } else {
        setFiles([]);
      }
    } catch {
      setFiles([]);
    }
  }, [worktreeRoot]);

  useEffect(() => {
    if (open) {
      loadFiles();
      setError(null);
    }
  }, [open, loadFiles]);

  const handlePush = useCallback(async () => {
    if (!worktreeRoot || !projectRoot || files.length === 0) return;
    if (!activeWorktree) return;

    setPushing(true);
    setError(null);
    setPushStep(0);

    const currentBranch = await window.electronAPI.gitStatus(projectRoot)
      .then((s: any) => s.branch)
      .catch(() => "");
    const alreadyOnBase = currentBranch === baseBranch;

    // Build step list — stash + pop are unconditional (the project repo may
    // have uncommitted changes even when we're already on the base branch).
    const steps = alreadyOnBase
      ? ["Saving files…", "Committing in worktree…", "Stashing project changes…", "Merging into " + baseBranch + "…", "Committing merge…", "Restoring project changes…"]
      : ["Saving files…", "Committing in worktree…", "Stashing project changes…", "Switching to " + baseBranch + "…", "Merging…", "Committing merge…", "Restoring project changes…"];
    setPushSteps(steps);

    let didStash = false;

    try {
      // 1. Save dirty editor files
      const docStore = useDocumentStore.getState();
      await docStore.saveAllFiles();
      setPushStep(1);

      // 2. Commit all changes in the worktree
      const worktreeFiles = files.map((f) => f.path);
      const commitResult = await window.electronAPI.gitCommitAll(
        worktreeRoot,
        worktreeFiles,
        `worktree(${activeWorktree.name}): ${files.length} file${files.length !== 1 ? "s" : ""}`,
      );
      if (!commitResult.success && !commitResult.error?.includes("nothing to commit")) {
        throw new Error(`Failed to commit in worktree: ${commitResult.error}`);
      }

      // 3. Always stash project changes — merge requires a clean working tree
      //    even when we're already on the base branch.
      setPushStep(2);
      try {
        const stashResult = await window.electronAPI.gitStash(
          projectRoot,
          `auto-save before push from ${activeWorktree.name}`,
        );
        didStash = stashResult.success;
      } catch { /* no changes to stash */ }

      // 4. Checkout base branch if needed
      if (!alreadyOnBase) {
        setPushStep(3);
        const checkoutResult = await window.electronAPI.gitCheckout(projectRoot, baseBranch);
        if (!checkoutResult.success) {
          throw new Error(`Failed to checkout ${baseBranch}: ${checkoutResult.error}`);
        }
      }

      // 5. Merge worktree branch into base branch
      setPushStep(alreadyOnBase ? 3 : 4);
      const mergeResult = await window.electronAPI.gitMergeNoCommit(projectRoot, activeWorktree.branch);
      if (!mergeResult.success) {
        throw new Error(`Merge failed: ${mergeResult.error}`);
      }

      // 6. Commit the merge
      setPushStep(alreadyOnBase ? 4 : 5);
      const mergeCommitMsg = `Merge worktree ${activeWorktree.name} into ${baseBranch}\n\n${files.length} file${files.length !== 1 ? "s" : ""} from ${activeWorktree.name}`;
      const mergeCommitResult = await window.electronAPI.gitCommit(projectRoot, mergeCommitMsg);
      if (!mergeCommitResult.success) {
        throw new Error(`Failed to commit merge: ${mergeCommitResult.error}`);
      }

      // 7. Restore stashed project changes on top of the merge
      if (didStash) {
        setPushStep(alreadyOnBase ? 5 : 6);
        try {
          const popResult = await window.electronAPI.gitStashPop(projectRoot);
          if (!popResult.success) {
            toast.warning("Stashed changes could not be auto-restored", {
              description: "Use the Git panel to recover them with 'Stash Pop'.",
              duration: 8000,
            });
          }
        } catch {
          toast.warning("Stashed changes could not be auto-restored", {
            description: "Your pending changes are still in the stash.",
            duration: 8000,
          });
        }
      }

      toast.success(
        `Pushed ${files.length} file${files.length !== 1 ? "s" : ""} from ${activeWorktree.name} → ${baseBranch}`,
      );

      await useWorktreeStore.getState().refreshWorktrees(projectRoot);

      // Refresh git panel to show clean state
      const { useGitStore } = await import("@/stores/git-store");
      useGitStore.getState().refreshStatus(projectRoot);

      onOpenChange(false);
    } catch (err: any) {
      // On failure, try to restore stashed changes before showing the error
      if (didStash) {
        try { await window.electronAPI.gitStashPop(projectRoot); } catch {}
      }
      setError(err?.message || "Push failed");
      toast.error(`Push failed: ${err?.message}`);
    } finally {
      setPushing(false);
    }
  }, [worktreeRoot, projectRoot, files, baseBranch, activeWorktree, onOpenChange]);

  if (!activeWorktree) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Push Worktree Changes</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Header info */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranchIcon className="size-3.5" />
            <span className="truncate">{activeWorktree.branch}</span>
            <span className="text-primary font-semibold">→</span>
            <GitBranchIcon className="size-3.5 text-primary" />
            <span className="truncate text-primary">{baseBranch}</span>
          </div>

          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No changes to push
            </p>
          ) : (
            <>
              {/* File list */}
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {files.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border last:border-0"
                  >
                    <span
                      className={cn(
                        "font-mono text-[10px] shrink-0 w-3",
                        f.status === "M" && "text-amber-500",
                        f.status === "A" && "text-emerald-500",
                        f.status === "D" && "text-red-500",
                        f.status === "?" && "text-muted-foreground",
                      )}
                    >
                      {f.status}
                    </span>
                    <span className="truncate">{f.path}</span>
                  </div>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded text-xs text-destructive bg-destructive/5">
                  <AlertTriangleIcon className="size-3 shrink-0" />
                  <span className="truncate">{error}</span>
                </div>
              )}

              {/* Progress */}
              {pushing && pushSteps.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2Icon className="size-3 animate-spin shrink-0" />
                    <span className="truncate">{pushSteps[pushStep] || pushSteps[pushSteps.length - 1]}</span>
                  </div>
                  <Progress value={((pushStep + 1) / pushSteps.length) * 100} />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  {files.length} file{files.length !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    disabled={pushing}
                    className="flex items-center h-8 px-3 rounded-md text-xs font-medium border border-border hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePush}
                    disabled={pushing || files.length === 0}
                    className="flex items-center gap-1.5 h-8 px-4 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {pushing ? (
                      <>
                        <Loader2Icon className="size-3 animate-spin" />
                        Pushing...
                      </>
                    ) : (
                      <>
                        Push {files.length} file{files.length !== 1 ? "s" : ""} → {baseBranch}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
