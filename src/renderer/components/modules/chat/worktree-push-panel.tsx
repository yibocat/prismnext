import { useState, useEffect, useCallback } from "react";
import { Loader2Icon, AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useDocumentStore } from "@/stores/document-store";
import { cn } from "@/lib/utils";

interface ChangedFile {
  path: string;
  status: string;
}

interface WorktreePushPanelProps {
  onClose: () => void;
}

export function WorktreePushPanel({ onClose }: WorktreePushPanelProps) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
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
      // Flush any unsaved editor changes to disk before checking git status
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
    loadFiles();
  }, [loadFiles]);

  const handlePush = useCallback(async () => {
    if (!worktreeRoot || !projectRoot || files.length === 0) return;
    if (!activeWorktree) return;

    setPushing(true);
    setError(null);
    setPushStep(0);

    // Build step list based on whether we need to switch branches
    const currentBranch = await window.electronAPI.gitStatus(projectRoot)
      .then((s: any) => s.branch)
      .catch(() => "");
    const alreadyOnBase = currentBranch === baseBranch;

    const steps = alreadyOnBase
      ? ["Saving files…", "Committing in worktree…", "Merging into " + baseBranch + "…", "Committing merge…"]
      : ["Saving files…", "Committing in worktree…", "Switching to " + baseBranch + "…", "Merging…", "Committing merge…", "Restoring pending changes…"];
    setPushSteps(steps);

    try {
      // 1. Save dirty files + commit in the worktree
      const docStore = useDocumentStore.getState();
      await docStore.saveAllFiles();
      setPushStep(1);

      const worktreeFiles = files.map((f) => f.path);
      const commitResult = await window.electronAPI.gitCommitAll(
        worktreeRoot,
        worktreeFiles,
        `worktree(${activeWorktree.name}): ${files.length} file${files.length !== 1 ? "s" : ""}`,
      );
      if (!commitResult.success && !commitResult.error?.includes("nothing to commit")) {
        throw new Error(`Failed to commit in worktree: ${commitResult.error}`);
      }

      let didStash = false;
      if (!alreadyOnBase) {
        setPushStep(2);
        // Stash pending changes so checkout is clean
        try {
          const stashResult = await window.electronAPI.gitStash(
            projectRoot,
            `auto-save before push from ${activeWorktree.name}`,
          );
          if (stashResult.success) didStash = true;
        } catch { /* no changes to stash */ }

        // Checkout base branch
        const checkoutResult = await window.electronAPI.gitCheckout(projectRoot, baseBranch);
        if (!checkoutResult.success) {
          if (didStash) { try { await window.electronAPI.gitStashPop(projectRoot); } catch {} }
          throw new Error(`Failed to checkout ${baseBranch}: ${checkoutResult.error}`);
        }
      }

      // 3/4. Merge worktree branch into base branch
      setPushStep(alreadyOnBase ? 2 : 3);
      const mergeResult = await window.electronAPI.gitMergeNoCommit(projectRoot, activeWorktree.branch);
      if (!mergeResult.success) {
        if (didStash) { try { await window.electronAPI.gitStashPop(projectRoot); } catch {} }
        throw new Error(`Merge failed: ${mergeResult.error}`);
      }

      // 4/5. Commit the merge result
      setPushStep(alreadyOnBase ? 3 : 4);
      const mergeCommitMsg = `Merge worktree ${activeWorktree.name} into ${baseBranch}\n\n${files.length} file${files.length !== 1 ? "s" : ""} from ${activeWorktree.name}`;
      const mergeCommitResult = await window.electronAPI.gitCommit(projectRoot, mergeCommitMsg);
      if (!mergeCommitResult.success) {
        if (didStash) { try { await window.electronAPI.gitStashPop(projectRoot); } catch {} }
        throw new Error(`Failed to commit merge: ${mergeCommitResult.error}`);
      }

      // 5/6. Restore stashed changes
      if (didStash) {
        setPushStep(5);
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
      onClose();
    } catch (err: any) {
      setError(err?.message || "Push failed");
      toast.error(`Push failed: ${err?.message}`);
    } finally {
      setPushing(false);
    }
  }, [worktreeRoot, projectRoot, files, baseBranch, activeWorktree, onClose]);

  if (!activeWorktree) return null;

  return (
    <div className="py-1">
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[length:var(--font-size-12)] font-medium text-muted-foreground">
          Worktree changes · {activeWorktree.name}
        </span>
        <button
          onClick={loadFiles}
          className="text-[length:var(--font-hint)] text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh file list"
        >
          Refresh
        </button>
      </div>

      {files.length === 0 ? (
        <div className="px-3 py-3 text-muted-foreground text-[length:var(--font-chat-meta)] text-center">
          No changes to push
        </div>
      ) : (
        <>
          <div className="max-h-64 overflow-y-auto">
            {files.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-2 px-3 py-1 text-[length:var(--font-chat-meta)]"
              >
                <span className={cn(
                  "font-mono text-[length:var(--font-hint)] shrink-0 w-4",
                  f.status === "M" && "text-amber-500",
                  f.status === "A" && "text-emerald-500",
                  f.status === "D" && "text-red-500",
                  f.status === "?" && "text-muted-foreground",
                )}>
                  {f.status}
                </span>
                <span className="truncate">{f.path}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 mx-2 mt-1 rounded text-[length:var(--font-chat-meta)] text-destructive bg-destructive/5">
              <AlertTriangleIcon className="size-3 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          {/* ── Progress bar during push ── */}
          {pushing && pushSteps.length > 0 && (
            <div className="px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2 text-[length:var(--font-hint)] text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin shrink-0" />
                <span className="truncate">{pushSteps[pushStep] || pushSteps[pushSteps.length - 1]}</span>
              </div>
              <Progress value={((pushStep + 1) / pushSteps.length) * 100} />
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-2 border-t border-border mt-1">
            <span className="text-[length:var(--font-hint)] text-muted-foreground">
              {files.length} file{files.length !== 1 ? "s" : ""} → <strong className="text-foreground">{baseBranch}</strong>
            </span>
            <button
              onClick={handlePush}
              disabled={pushing}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[length:var(--font-chat-meta)] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
              )}
            >
              {pushing ? (
                <>
                  <Loader2Icon className="size-3 animate-spin" />
                  Pushing...
                </>
              ) : (
                "Push"
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
