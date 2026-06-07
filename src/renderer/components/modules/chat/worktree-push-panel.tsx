import { useState, useEffect, useCallback } from "react";
import { Loader2Icon, AlertTriangleIcon } from "lucide-react";
import { toast } from "sonner";
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
  const [error, setError] = useState<string | null>(null);

  const worktreeRoot = activeWorktree?.path;
  const baseBranch = activeWorktree?.baseBranch || "main";

  const loadFiles = useCallback(async () => {
    if (!worktreeRoot) return;
    try {
      const result = await window.electronAPI.gitStatus(worktreeRoot);
      if (result.files) {
        setFiles(
          result.files
            .filter((f: any) => {
              const s = f.indexStatus || f.worktreeStatus || "";
              return s.trim() !== "";
            })
            .map((f: any) => ({
              path: f.path,
              status: f.indexStatus || f.worktreeStatus || "?",
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

    try {
      // 1. Save dirty files + commit in the worktree
      const docStore = useDocumentStore.getState();
      await docStore.saveAllFiles();

      const worktreeFiles = files.map((f) => f.path);
      const commitResult = await window.electronAPI.gitCommitAll(
        worktreeRoot,
        worktreeFiles,
        `worktree(${activeWorktree.name}): ${files.length} file${files.length !== 1 ? "s" : ""}`,
      );
      if (!commitResult.success && !commitResult.error?.includes("nothing to commit")) {
        throw new Error(`Failed to commit in worktree: ${commitResult.error}`);
      }

      // 2. Stash any pending changes in the main project so checkout is clean.
      //    Using stash instead of auto-commit avoids creating unwanted commits
      //    on whatever branch the main project happens to be on.
      let didStash = false;
      try {
        const stashResult = await window.electronAPI.gitStash(
          projectRoot,
          `auto-save before push from ${activeWorktree.name}`,
        );
        if (stashResult.success) didStash = true;
      } catch {
        // no changes to stash — that's fine
      }

      // 3. Checkout base branch
      const checkoutResult = await window.electronAPI.gitCheckout(projectRoot, baseBranch);
      if (!checkoutResult.success) {
        // Restore stash before throwing so pending changes aren't lost
        if (didStash) {
          try { await window.electronAPI.gitStashPop(projectRoot); } catch {}
        }
        throw new Error(`Failed to checkout ${baseBranch}: ${checkoutResult.error}`);
      }

      // 4. Merge worktree branch into base branch (--no-commit: staged, not committed)
      const mergeResult = await window.electronAPI.gitMergeNoCommit(projectRoot, activeWorktree.branch);
      if (!mergeResult.success) {
        // Restore stash before throwing so pending changes aren't lost
        if (didStash) {
          try { await window.electronAPI.gitStashPop(projectRoot); } catch {}
        }
        throw new Error(`Merge failed: ${mergeResult.error}`);
      }

      // 5. Commit the merge result immediately — this LOCKS the changes to
      //    baseBranch. Without this commit, the staged merge result lives in
      //    Git's index (not tied to any branch) and will "follow" the user
      //    when they switch branches — appearing on master, feature-x, etc.
      const mergeCommitMsg = `Merge worktree ${activeWorktree.name} into ${baseBranch}\n\n${files.length} file${files.length !== 1 ? "s" : ""} from ${activeWorktree.name}`;
      const mergeCommitResult = await window.electronAPI.gitCommit(projectRoot, mergeCommitMsg);
      if (!mergeCommitResult.success) {
        // Restore stash before throwing
        if (didStash) {
          try { await window.electronAPI.gitStashPop(projectRoot); } catch {}
        }
        throw new Error(`Failed to commit merge: ${mergeCommitResult.error}`);
      }

      // 6. Restore stashed changes on top of the committed merge
      if (didStash) {
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
            description: "Your pending changes are still in the stash — use 'Stash Pop' in the Git panel to recover them.",
            duration: 8000,
          });
        }
      }

      toast.success(
        `Pushed ${files.length} file${files.length !== 1 ? "s" : ""} from ${activeWorktree.name} → ${baseBranch}`,
      );

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
      <div className="text-[length:var(--font-size-12)] font-medium px-3 py-1 text-muted-foreground">
        Worktree changes · {activeWorktree.name}
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

          <div className="flex items-center justify-between px-3 py-2 border-t border-border mt-1">
            <span className="text-[length:var(--font-hint)] text-muted-foreground">
              {files.length} file{files.length !== 1 ? "s" : ""} → <strong className="text-foreground">{baseBranch}</strong>
              <span className="ml-1 opacity-60">(merge --no-commit)</span>
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
