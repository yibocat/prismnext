import { useState, useEffect, useCallback } from "react";
import { Loader2Icon, AlertTriangleIcon } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useDocumentStore } from "@/stores/document-store";
import { cn } from "@/lib/utils";
import {
  buildMergeToBranchStepLabels,
  canMergeWorktree,
  loadWorktreeChangedFiles,
  mergeWorktreeToBase,
  type WorktreeChangedFile,
} from "@/lib/git/git-orchestrator";
import { useResolvedWorktree } from "@/lib/git/use-resolved-worktree";
import { syncAfterWorktreeMerge } from "@/lib/git/git-sync";

interface WorktreeMergePanelProps {
  onClose: () => void;
}

export function WorktreeMergePanel({ onClose }: WorktreeMergePanelProps) {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const resolvedWorktree = useResolvedWorktree({ refreshOnMount: true });

  const [files, setFiles] = useState<WorktreeChangedFile[]>([]);
  const [merging, setMerging] = useState(false);
  const [mergeStep, setMergeStep] = useState(-1);
  const [mergeSteps, setMergeSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const worktreeRoot = resolvedWorktree?.path;
  const baseBranch = resolvedWorktree?.baseBranch || "main";
  const aheadCount = resolvedWorktree?.aheadCount ?? 0;
  const canMerge = canMergeWorktree(files.length, aheadCount);

  const loadFiles = useCallback(async () => {
    if (!worktreeRoot) return;
    setFiles(await loadWorktreeChangedFiles(worktreeRoot));
  }, [worktreeRoot]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleMerge = useCallback(async () => {
    if (!worktreeRoot || !projectRoot || !canMerge || !resolvedWorktree) return;

    setMerging(true);
    setError(null);
    setMergeStep(0);

    const currentBranch = await window.electronAPI.gitStatus(projectRoot)
      .then((s) => s.branch)
      .catch(() => "");
    const labels = buildMergeToBranchStepLabels(baseBranch, currentBranch === baseBranch);
    setMergeSteps(labels);

    const result = await mergeWorktreeToBase(
      {
        projectRoot,
        worktree: resolvedWorktree,
        changedFiles: files.map((f) => f.path),
        aheadCount,
      },
      (progress) => setMergeStep(progress.index),
    );

    if (result.success) {
      if (result.rollbackWarnings?.length) {
        for (const warning of result.rollbackWarnings) {
          toast.warning(warning, { duration: 8000 });
        }
      }
      await syncAfterWorktreeMerge(projectRoot, worktreeRoot, resolvedWorktree.name);
      toast.success(`Merged ${result.changeSummary} into ${baseBranch}`);
      onClose();
    } else {
      setError(result.error || "Merge failed");
      if (result.rollbackWarnings?.length) {
        toast.warning("Merge rolled back with warnings", {
          description: result.rollbackWarnings.join(" "),
          duration: 10000,
        });
      }
      toast.error(`Merge failed: ${result.error}`);
    }

    setMerging(false);
  }, [worktreeRoot, projectRoot, files, baseBranch, resolvedWorktree, onClose, canMerge, aheadCount]);

  return (
    <div className="p-3 space-y-3">
      <div className="px-1">
        <p className="text-xs font-medium text-foreground">Merge to Branch</p>
        <p className="text-[length:var(--font-hint)] text-muted-foreground mt-0.5">
          Integrate worktree changes into <code className="text-xs bg-muted px-1 rounded">{baseBranch}</code>.
          The worktree stays open — this is not a remote push.
        </p>
      </div>

      {!canMerge ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No changes to merge
        </p>
      ) : (
        <>
          {files.length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-md border">
              {files.map((f) => (
                <div
                  key={f.path}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-border last:border-0"
                >
                  <span
                    className={cn(
                      "font-mono text-[length:var(--font-size-10)] shrink-0 w-3",
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
          ) : (
            <p className="text-xs text-muted-foreground px-1">
              {aheadCount} commit{aheadCount !== 1 ? "s" : ""} ready to merge into {baseBranch}
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded text-xs text-destructive bg-destructive/5">
              <AlertTriangleIcon className="size-3 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          {merging && mergeSteps.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2Icon className="size-3 animate-spin shrink-0" />
                <span className="truncate">{mergeSteps[mergeStep] || mergeSteps[mergeSteps.length - 1]}</span>
              </div>
              <Progress value={((mergeStep + 1) / mergeSteps.length) * 100} />
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">
              {files.length > 0
                ? `${files.length} file${files.length !== 1 ? "s" : ""}`
                : `${aheadCount} commit${aheadCount !== 1 ? "s" : ""}`}
            </span>
            <button
              type="button"
              onClick={handleMerge}
              disabled={merging}
              className={cn(
                "flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
              )}
            >
              {merging ? (
                <>
                  <Loader2Icon className="size-3 animate-spin" />
                  Merging…
                </>
              ) : (
                `Merge → ${baseBranch}`
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** @deprecated Use WorktreeMergePanel */